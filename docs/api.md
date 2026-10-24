# Synapse API Setup

## 0 - GET Request Information /api/health

A wellness check called every 30 seconds.

```json
{
  "status": "ok",
  "version": "0.4",
  "commit": "3fa1c2e"
}
```

`version` is `API_VERSION` in `api/app/main.py` and changes every time we want to make a change to the api to communicate clearly with the frontend. 

`commit` comes from the `SYNAPSE_COMMIT` environment variable and helps us debug in the future if there is an issue with code when a certain part was updated last.

## 1 - POST Request Information /api/inferences

When the router receives a post request, it validates the incoming image's (named `image`) magic bytes to make sure that it has a valid file type and also checks the file size to make sure that it doesn't exceed a size of 10MiB.

Accepted file types are PNG and JPEG only. PDF is planned, but is rejected for now because it needs first-page rasterization, which doesn't exist yet.

`declared_mime` is based on what the client called the file and isn't necessarily trustworthy

`detected_mime` on the otherhand is and proved by an actual file signature check. 

The`filename` can also be `null` because the clients doesn't need to send one.



### InferenceResponse Shape based on Schema

```json
{
  "id": "3f6c2c1e-8a0b-4d57-9a43-5d1f0e7b9c21",
  "upload": {
    "filename": "digit.png",
    "declared_mime": "image/png",
    "detected_mime": "image/png",
    "bytes": 108,
    "width": 20,
    "height": 10,
    "format": "PNG"
  }
}
```

`width`, `height` and `format` come from fully decoding the image with Pillow, so they prove the file is a real, readable image and not just one with a valid signature. `format` is Pillow's name for it (`"PNG"` or `"JPEG"`).


### Errors

Every error uses the same shape right now which is: `{"error": {"code", "message"}}`.

**400 `INVALID_IMAGE`** if the file is empty, its bytes do not correlate to an accepted image type, or the image is truncated or corrupt and can't be fully decoded.

```json
{
  "error": {
    "code": "INVALID_IMAGE",
    "message": "File is not a PNG or JPEG."
  }
}
```

**413 `FILE_TOO_LARGE`** if the image file exceeds the 10 MiB file size limit.

```json
{
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File is 10485800 bytes; limit is 10485760."
  }
}
```

**413 `IMAGE_DIMENSIONS_TOO_LARGE`** error if the incoming image file has 50,000,000 pixels or more, seperate from `FILE_TOO_LARGE`: which only limits size from uploads, not from a compressed file.

```json
{
  "error": {
    "code": "IMAGE_DIMENSIONS_TOO_LARGE",
    "message": "Image is 9000x6000; limit is 50000000 pixels."
  }
}
```

Finally, If an HTTP request doesn't have an `image` field, it gets auto-rejected with a 422 error.
