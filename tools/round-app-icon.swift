import AppKit
import ImageIO
import UniformTypeIdentifiers
let input = URL(fileURLWithPath: CommandLine.arguments[1])
let output = URL(fileURLWithPath: CommandLine.arguments[2])
guard let source = CGImageSourceCreateWithURL(input as CFURL, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { fatalError("Cannot read icon") }
let space = CGColorSpace(name: CGColorSpace.sRGB)!
let context = CGContext(data:nil,width:1024,height:1024,bitsPerComponent:8,bytesPerRow:0,space:space,bitmapInfo:CGImageAlphaInfo.premultipliedLast.rawValue)!
context.interpolationQuality = .high
context.setAllowsAntialiasing(true)
// Keep the entire supplied white artwork as a third, rounded tile, with Dock margins.
let tile = CGRect(x:100,y:100,width:824,height:824)
context.addPath(CGPath(roundedRect:tile,cornerWidth:184,cornerHeight:184,transform:nil))
context.clip()
context.draw(image,in:tile)
let result = context.makeImage()!
let destination = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(destination,result,nil)
assert(CGImageDestinationFinalize(destination))
