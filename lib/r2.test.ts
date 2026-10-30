import { AbortMultipartUploadCommand, CompleteMultipartUploadCommand, CreateMultipartUploadCommand, DeleteObjectsCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { mockClient } from 'aws-sdk-client-mock'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(async (_client: unknown, command: { input: { Key: string; ContentType?: string } }, options: { expiresIn: number }) => {
    return `https://signed.example/${command.input.Key}?expires=${options.expiresIn}&type=${command.input.ContentType ?? 'get'}`
  }),
}))

const s3Mock = mockClient(S3Client)

describe('R2 signer', () => {
  beforeEach(() => {
    s3Mock.reset()
    process.env.R2_ACCOUNT_ID = 'account'
    process.env.R2_ACCESS_KEY_ID = 'key'
    process.env.R2_SECRET_ACCESS_KEY = 'secret'
    process.env.R2_BUCKET_NAME = 'sicpic'
    delete process.env.R2_ENDPOINT
  })

  afterEach(async () => {
    const { resetR2ClientForTests } = await import('@/lib/r2')
    resetR2ClientForTests()
  })

  it('signs put and get urls with the requested expiry and content type', async () => {
    const { createR2Signer } = await import('@/lib/r2')
    const signer = createR2Signer()
    const put = await signer.signPut({ key: 'members/a/photos/b/original.jpg', contentType: 'image/jpeg', expiresIn: 300 })
    const got = await signer.signGet({ key: 'members/a/photos/b/thumb.jpg', expiresIn: 120 })
    expect(put).toContain('expires=300')
    expect(put).toContain('type=image/jpeg')
    expect(got).toContain('expires=120')
    expect(got).toContain('thumb.jpg')
  })

  it('turns a missing object into a clean client error and deletes keys', async () => {
    const missing = new Error('NoSuchKey secret')
    missing.name = 'NotFound'
    s3Mock.on(HeadObjectCommand).rejectsOnce(missing).resolves({ ContentLength: 12, ContentType: 'image/jpeg' })
    const { headR2Object, deleteR2Objects } = await import('@/lib/r2')
    await expect(headR2Object('members/a/photos/b/original.jpg')).rejects.toMatchObject({ status: 400, code: 'incomplete' })
    const head = await headR2Object('members/a/photos/b/display.jpg')
    expect(head.byteSize).toBe(12)
    s3Mock.on(DeleteObjectsCommand).resolves({})
    await deleteR2Objects(['members/a/photos/b/original.jpg', 'members/a/photos/b/original.jpg', ''])
    expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(1)
  })

  it('does not sign a traversal key', async () => {
    const { createLazyR2Signer } = await import('@/lib/r2')
    const signer = createLazyR2Signer()
    await expect(signer.signGet({ key: '../secret', expiresIn: 60 })).rejects.toMatchObject({ status: 400 })
    await expect(signer.signPut({ key: '../secret', contentType: 'image/jpeg', expiresIn: 60 })).rejects.toMatchObject({ status: 400 })
  })

  it('reports missing configuration and unexpected storage errors', async () => {
    delete process.env.R2_ACCOUNT_ID
    const { getR2Client, headR2Object, deleteR2Objects, resetR2ClientForTests } = await import('@/lib/r2')
    resetR2ClientForTests()
    expect(() => getR2Client()).toThrow(/R2_ACCOUNT_ID/)
    process.env.R2_ACCOUNT_ID = 'account'
    process.env.R2_ENDPOINT = 'https://custom.example'
    resetR2ClientForTests()
    expect(getR2Client()).toBe(getR2Client())
    s3Mock.on(HeadObjectCommand).rejectsOnce('plain').rejectsOnce(Object.assign(new Error('no'), { name: 'NoSuchKey' }))
    await expect(headR2Object('members/a/photos/b/original.jpg')).rejects.toThrow('plain')
    await expect(headR2Object('members/a/photos/b/original.jpg')).rejects.toMatchObject({ code: 'incomplete' })
    const missing = Object.assign(new Error('gone'), { name: 'Other', $metadata: { httpStatusCode: 404 } })
    s3Mock.reset()
    s3Mock.on(HeadObjectCommand).rejects(missing)
    await expect(headR2Object('members/a/photos/b/thumb.jpg')).rejects.toMatchObject({ code: 'incomplete' })
    s3Mock.on(DeleteObjectsCommand).resolves({})
    await deleteR2Objects([])
    expect(s3Mock.commandCalls(DeleteObjectsCommand)).toHaveLength(0)
  })

  it('starts, signs, completes and aborts a multipart upload', async () => {
    s3Mock.on(CreateMultipartUploadCommand).resolves({ UploadId: 'upload-12345678' })
    s3Mock.on(CompleteMultipartUploadCommand).resolves({})
    s3Mock.on(AbortMultipartUploadCommand).resolves({})
    const { createMultipartUpload, signUploadPart, completeMultipartUpload, abortMultipartUpload } = await import('@/lib/r2')
    const key = 'members/11111111-1111-4111-8111-111111111111/photos/44444444-4444-4444-8444-444444444444/original.mp4'
    await expect(createMultipartUpload(key, 'video/mp4')).resolves.toBe('upload-12345678')
    const url = await signUploadPart({ key, uploadId: 'upload-12345678', partNumber: 2, expiresIn: 300 })
    expect(url).toContain('original.mp4')
    await completeMultipartUpload({ key, uploadId: 'upload-12345678', parts: [{ partNumber: 1, etag: '"abc"' }] })
    await abortMultipartUpload(key, 'upload-12345678')
    expect(s3Mock.commandCalls(CompleteMultipartUploadCommand)).toHaveLength(1)
    expect(s3Mock.commandCalls(AbortMultipartUploadCommand)).toHaveLength(1)
    s3Mock.on(CreateMultipartUploadCommand).resolves({})
    await expect(createMultipartUpload(key, 'video/mp4')).rejects.toMatchObject({ status: 500 })
  })
})
