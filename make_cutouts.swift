// Step 1c (optional): cut players out of photos for the tip-off hero and the Q1 title card.
//
//     swift make_cutouts.swift           # build every cutout listed in web/assets/players/cutouts.csv
//     swift make_cutouts.swift --list    # only show the people Vision finds in each photo
//
// Each row's `source` is a URL or a local path; downloads are cached in data/raw/cutouts/. A source that
// already has a transparent background (a ready-made PNG cutout) is only trimmed and resized. A plain
// photo is cut out with Apple's Vision framework (macOS 14+, nothing to install), keeping the person
// numbered `instance` (blank: the largest person in the photo; --list prints the numbers). Writes
// web/assets/players/<slug>.png, cropped to the player and at most 1400 px tall.
//
// Without this step the site simply leaves the figures out. The photos are press and web images of NBA
// players, used here for a course project only.
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
let listFile = root.appendingPathComponent("web/assets/players/cutouts.csv")
let outDir = root.appendingPathComponent("web/assets/players")
let cacheDir = root.appendingPathComponent("data/raw/cutouts")
let userAgent = "CS6730-nba-story-cutouts/1.0 (Georgia Tech course project; one-off download)"
let pause: TimeInterval = 1.5   // seconds between downloads
let maxHeight = 1400
let srgb = CGColorSpace(name: CGColorSpace.sRGB)!

struct Failure: Error, CustomStringConvertible { let description: String }

/// Rows of a CSV file as dictionaries keyed by the header. Quoted fields may hold commas.
func readCSV(_ url: URL) throws -> [[String: String]] {
  var rows: [[String]] = [[]]
  var field = ""
  var quoted = false
  for ch in try String(contentsOf: url, encoding: .utf8) {
    if quoted {
      if ch == "\"" { quoted = false } else { field.append(ch) }
    } else if ch == "\"" {
      if !field.isEmpty { field.append(ch) }   // a doubled quote inside a quoted field
      quoted = true
    } else if ch == "," {
      rows[rows.count - 1].append(field); field = ""
    } else if ch == "\n" || ch == "\r\n" {
      rows[rows.count - 1].append(field); field = ""; rows.append([])
    } else {
      field.append(ch)
    }
  }
  if !field.isEmpty || !(rows.last?.isEmpty ?? true) { rows[rows.count - 1].append(field) }
  let header = rows.removeFirst()
  return rows.filter { $0.count > 1 }.map { Dictionary(uniqueKeysWithValues: zip(header, $0)) }
}

/// The source as a local file: a path as given, or a URL downloaded once into the cache.
var lastDownload = Date.distantPast
func localFile(_ source: String, slug: String) throws -> URL {
  guard let url = URL(string: source), let scheme = url.scheme, scheme.hasPrefix("http") else {
    return URL(fileURLWithPath: source, relativeTo: root)
  }
  let name = url.lastPathComponent.removingPercentEncoding ?? url.lastPathComponent
  let file = cacheDir.appendingPathComponent("\(slug)-\(name)")
  if FileManager.default.fileExists(atPath: file.path) { return file }
  Thread.sleep(forTimeInterval: max(0, pause - Date().timeIntervalSince(lastDownload)))
  var request = URLRequest(url: url)
  request.setValue(userAgent, forHTTPHeaderField: "User-Agent")
  var result: Result<Data, Error> = .failure(Failure(description: "no response"))
  let done = DispatchSemaphore(value: 0)
  URLSession.shared.dataTask(with: request) { data, response, error in
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    if let data, status == 200 { result = .success(data) }
    else { result = .failure(error ?? Failure(description: "HTTP \(status)")) }
    done.signal()
  }.resume()
  done.wait()
  lastDownload = Date()
  try FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
  try result.get().write(to: file)
  return file
}

func loadImage(_ file: URL) throws -> (image: CGImage, alpha: Bool) {
  guard let src = CGImageSourceCreateWithURL(file as CFURL, nil),
        let image = CGImageSourceCreateImageAtIndex(src, 0, [kCGImageSourceShouldCache: true] as CFDictionary)
  else { throw Failure(description: "cannot read \(file.path)") }
  let props = CGImageSourceCopyPropertiesAtIndex(src, 0, nil) as? [CFString: Any]
  let orientation = (props?[kCGImagePropertyOrientation] as? UInt32).flatMap(CGImagePropertyOrientation.init) ?? .up
  let upright = orientation == .up ? image : render(CIImage(cgImage: image).oriented(orientation))
  return (upright, props?[kCGImagePropertyHasAlpha] as? Bool ?? false)
}

func render(_ image: CIImage) -> CGImage {
  CIContext().createCGImage(image, from: image.extent, format: .RGBA8, colorSpace: srgb)!
}

/// Each person Vision separates from the background: instance number → (share of the photo, box).
/// Boxes are fractions of the photo, measured from its top-left corner.
func people(in obs: VNInstanceMaskObservation) -> [Int: (share: Double, box: CGRect)] {
  let mask = obs.instanceMask
  CVPixelBufferLockBaseAddress(mask, .readOnly)
  defer { CVPixelBufferUnlockBaseAddress(mask, .readOnly) }
  let w = CVPixelBufferGetWidth(mask), h = CVPixelBufferGetHeight(mask)
  let stride = CVPixelBufferGetBytesPerRow(mask)
  let px = CVPixelBufferGetBaseAddress(mask)!.assumingMemoryBound(to: UInt8.self)
  var count: [Int: Int] = [:]
  var box: [Int: (Int, Int, Int, Int)] = [:]
  for y in 0..<h {
    for x in 0..<w {
      let k = Int(px[y * stride + x])
      if k == 0 { continue }
      count[k, default: 0] += 1
      let b = box[k] ?? (x, y, x, y)
      box[k] = (min(b.0, x), min(b.1, y), max(b.2, x), max(b.3, y))
    }
  }
  var out: [Int: (share: Double, box: CGRect)] = [:]
  for (k, n) in count {
    let b = box[k]!
    out[k] = (Double(n) / Double(w * h),
              CGRect(x: Double(b.0) / Double(w), y: Double(b.1) / Double(h),
                     width: Double(b.2 - b.0 + 1) / Double(w), height: Double(b.3 - b.1 + 1) / Double(h)))
  }
  return out
}

/// The chosen person on a transparent background, cropped to them.
func cutOut(_ image: CGImage, instance: String, slug: String, listOnly: Bool) throws -> CGImage? {
  let request = VNGenerateForegroundInstanceMaskRequest()
  let handler = VNImageRequestHandler(cgImage: image)
  try handler.perform([request])
  guard let obs = request.results?.first else { throw Failure(description: "\(slug): nobody found in the photo") }
  let found = people(in: obs)
  let largest = found.max { $0.value.share < $1.value.share }!.key
  if listOnly {
    for (k, p) in found.sorted(by: { $0.key < $1.key }) {
      let b = p.box
      print(String(format: "  %d: %4.1f%% of the photo, box x %.2f–%.2f, y %.2f–%.2f%@", k, p.share * 100,
                   b.minX, b.maxX, b.minY, b.maxY, k == largest ? "  (default)" : ""))
    }
    return nil
  }
  let picked = instance.isEmpty ? IndexSet(integer: largest)
    : IndexSet(instance.split(separator: " ").compactMap { Int($0) })
  guard !picked.isEmpty, picked.isSubset(of: obs.allInstances) else {
    throw Failure(description: "\(slug): no person \(instance) (run with --list)")
  }
  let buffer = try obs.generateMaskedImage(ofInstances: picked, from: handler, croppedToInstancesExtent: true)
  return render(CIImage(cvPixelBuffer: buffer))
}

/// Crop away fully transparent margins.
func trim(_ image: CGImage) -> CGImage {
  let w = image.width, h = image.height
  var px = [UInt8](repeating: 0, count: w * h * 4)
  let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: srgb,
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
  var (x0, y0, x1, y1) = (w, h, -1, -1)
  for y in 0..<h {
    for x in 0..<w where px[(y * w + x) * 4 + 3] > 8 {
      x0 = min(x0, x); x1 = max(x1, x); y0 = min(y0, y); y1 = max(y1, y)
    }
  }
  guard x1 >= x0 else { return image }
  return image.cropping(to: CGRect(x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1)) ?? image
}

func fit(_ image: CGImage) -> CGImage {
  guard image.height > maxHeight else { return image }
  let w = Int((Double(image.width) * Double(maxHeight) / Double(image.height)).rounded())
  let ctx = CGContext(data: nil, width: w, height: maxHeight, bitsPerComponent: 8, bytesPerRow: 0, space: srgb,
                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.interpolationQuality = .high
  ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: maxHeight))
  return ctx.makeImage()!
}

func writePNG(_ image: CGImage, to file: URL) throws {
  guard let dest = CGImageDestinationCreateWithURL(file as CFURL, UTType.png.identifier as CFString, 1, nil)
  else { throw Failure(description: "cannot write \(file.path)") }
  CGImageDestinationAddImage(dest, image, nil)
  guard CGImageDestinationFinalize(dest) else { throw Failure(description: "cannot write \(file.path)") }
}

let listOnly = CommandLine.arguments.contains("--list")
var failed = 0
for row in try readCSV(listFile) {
  let slug = row["slug"] ?? ""
  do {
    let (image, alpha) = try loadImage(try localFile(row["source"] ?? "", slug: slug))
    print("\(slug): \(image.width)×\(image.height)\(alpha ? ", already transparent" : "")")
    if alpha && listOnly { continue }
    guard let person = alpha ? image : try cutOut(image, instance: row["instance"] ?? "", slug: slug, listOnly: listOnly)
    else { continue }
    let out = fit(trim(person))
    try writePNG(out, to: outDir.appendingPathComponent("\(slug).png"))
    print("  → web/assets/players/\(slug).png, \(out.width)×\(out.height)")
  } catch {
    print("  ! \(error)")
    failed += 1
  }
}
exit(failed == 0 ? 0 : 1)
