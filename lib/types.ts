export type MemberRole = 'admin' | 'member'

export type Member = {
  id: string
  userId: string | null
  email: string
  displayName: string
  role: MemberRole
}

export type FeedbackKind = 'bug' | 'feature'
export type FeedbackStatus = 'neu' | 'in_arbeit' | 'erledigt'

export type FeedbackItem = {
  id: string
  authorId: string
  authorName: string
  kind: FeedbackKind
  title: string
  body: string
  status: FeedbackStatus
  hasScreenshot: boolean
  createdAt: string
  updatedAt: string
}
export type PhotoVariant = 'original' | 'display' | 'thumb'
export type PhotoScope = 'group' | 'mine'

export type MediaType = 'photo' | 'video'
export type MediaFilter = 'all' | MediaType

export type GalleryPhoto = {
  id: string
  ownerId: string
  filename: string
  contentType: string
  byteSize: number
  width: number | null
  height: number | null
  capturedAt: string
  createdAt: string
  uploaderName: string
  thumbUrl: string
  thumbUrlLarge?: string | null
  blurData?: string | null
  mediaType?: MediaType
  durationMs?: number | null
  codec?: string | null
}

export type PhotoRecord = {
  id: string
  ownerId: string
  originalKey: string
  displayKey: string | null
  thumbKey: string | null
  filename: string
  contentType: string
  byteSize: number
  width: number | null
  height: number | null
  capturedAt: string
  createdAt: string
  uploaderName: string
  mediaType: MediaType
  durationMs: number | null
  codec: string | null
  thumbLargeKey: string | null
  blurData: string | null
}

export type SessionIdentity = {
  userId: string
}

export type MemberRow = {
  id: string
  user_id: string | null
  email: string
  display_name: string | null
  role: string
}
