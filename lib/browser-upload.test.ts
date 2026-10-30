import { describe, expect, it, vi } from 'vitest'
import { putPart, putWithProgress } from '@/lib/browser-upload'

describe('putWithProgress', () => {
  it('reports upload progress and resolves on success', async () => {
    const progress: number[] = []
    class FakeXHR {
      upload = { onprogress: (_event: ProgressEvent) => undefined }
      status = 200
      onload: () => void = () => undefined
      onerror: () => void = () => undefined
      open = vi.fn()
      setRequestHeader = vi.fn()
      send(body: Blob) {
        this.upload.onprogress?.({ lengthComputable: true, loaded: body.size, total: body.size } as ProgressEvent)
        this.onload()
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
    await putWithProgress('https://signed.example/file', new Blob(['abc']), 'image/jpeg', (ratio) => progress.push(ratio))
    expect(progress.at(-1)).toBe(1)
  })

  it('rejects a failed storage response without extra detail', async () => {
    class FakeXHR {
      upload = { onprogress: (_event: ProgressEvent) => undefined }
      status = 403
      onload: () => void = () => undefined
      onerror: () => void = () => undefined
      open = vi.fn()
      setRequestHeader = vi.fn()
      send() {
        this.onload()
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
    await expect(putWithProgress('https://signed.example/file', new Blob(['a']), 'image/jpeg', () => undefined)).rejects.toThrow(/403/)
  })

  it('rejects a network error with the CORS hint', async () => {
    class FakeXHR {
      upload = { onprogress: (_event: ProgressEvent) => undefined }
      status = 0
      onload: () => void = () => undefined
      onerror: () => void = () => undefined
      open = vi.fn()
      setRequestHeader = vi.fn()
      send() {
        this.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 } as ProgressEvent)
        this.onerror()
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
    await expect(putWithProgress('https://signed.example/file', new Blob(['a']), 'image/jpeg', () => undefined)).rejects.toThrow(/CORS/)
  })

  it('returns the part etag and complains when CORS hides it', async () => {
    class FakeXHR {
      upload = { onprogress: (_event: ProgressEvent) => undefined }
      status = 200
      onload: () => void = () => undefined
      onerror: () => void = () => undefined
      open = vi.fn()
      getResponseHeader(name: string) {
        return name.toLowerCase() === 'etag' ? '"abc"' : null
      }
      send() {
        this.onload()
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
    await expect(putPart('https://signed.example/part', new Blob(['abcd']), () => undefined)).resolves.toBe('"abc"')
    class HiddenEtag extends FakeXHR {
      override getResponseHeader() {
        return null
      }
    }
    vi.stubGlobal('XMLHttpRequest', HiddenEtag)
    await expect(putPart('https://signed.example/part', new Blob(['abcd']), () => undefined)).rejects.toThrow(/ETag/)
  })
})
