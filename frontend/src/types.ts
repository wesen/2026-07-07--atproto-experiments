// Types matching the Go backend's JSON shapes (see pkg/firehose/consumer.go
// and pkg/server/server.go).

export interface Post {
  did: string
  rkey: string
  uri: string
  cid: string
  text: string
  createdAt: string
  langs?: string[]
  tags?: string[]
  action: string
  seq: number
  time: string
}

export interface Status {
  lastSeq: number
  loggedIn: boolean
}

export interface Session {
  did: string
  handle: string
}
