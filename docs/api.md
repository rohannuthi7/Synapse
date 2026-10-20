# Synapse API Setup

## 1 - POST Request Information /api/inferences

When the router receives a post request, it validates the incoming image's (named `image`) magic bytes to make sure that it has a valid file type and also checks the file size to make sure that it doesn't exceed a size of 10MiB.

`declared_mime` is based on what the client called the file and isn't necessarily trustworthy; `detected_mime` on the otherhand is and proved by an acutal file signature check. The`filename` can also be `null` because the clients doesn't need to send one.



### InferenceResponse Shape based on Schema

```json
{
  "id": "3f6c2c1e-8a0b-4d57-9a43-5d1f0e7b9c21",
  "upload": {
    "filename": "digit.png",
    "declared_mime": "image/png",
    "detected_mime": "image/png",
    "bytes": 108
  }
}
```


### Errors

Every error uses the same shape right now which is: `{"error": {"code", "message"}}`.

**400 `INVALID_IMAGE`** if the file is empty or its bytes do not correlate to an accepted image type.

```json
{
  "error": {
    "code": "INVALID_IMAGE",
    "message": "File is not a PNG, JPEG, or PDF."
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

IIf a request comes without an `image` field, it is automatically rejected by FastAPI with error code 422.
