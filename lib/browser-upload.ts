export function putWithProgress(
  url: string,
  blob: Blob,
  contentType: string,
  onProgress: (ratio: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', contentType)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1)
        resolve()
      } else {
        reject(new Error(`Upload fehlgeschlagen (${xhr.status}).`))
      }
    }
    xhr.onerror = () => {
      reject(new Error('Upload fehlgeschlagen. Prüfe die CORS-Regel des R2-Buckets.'))
    }
    xhr.send(blob)
  })
}
