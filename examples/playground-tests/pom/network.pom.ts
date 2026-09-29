import { is, idIs, Task, Click, AssertRequest } from '@tomationjs/dsl'

const API = 'https://jsonplaceholder.typicode.com'

// --- Elements ---
const loadPostsButton = is.BUTTON.where(idIs('load-posts-btn')).as('Load Posts')
const getPostButton = is.BUTTON.where(idIs('get-post-btn')).as('Get Post')
const createPostButton = is.BUTTON.where(idIs('create-post-btn')).as('Create Post')
const result = is.CODE.where(idIs('result')).as('Result')
const status = is.SPAN.where(idIs('status')).as('Status')

// --- Actions ---
const loadPosts = Task(() => {
  Click(loadPostsButton)
}).as('Load Posts for User 1')

const getPost = Task(() => {
  Click(getPostButton)
}).as('Get Post #1')

const createPost = Task(() => {
  Click(createPostButton)
}).as('Create a Post')

// --- Request assertions ---
// GET /posts?userId=1 — verify method + query subset + 200
const assertPostsListRequest = Task(() => {
  AssertRequest(`${API}/posts`)
    .method('GET')
    .query({ userId: '1' })
    .status(200)
}).as('Assert GET /posts?userId=1')

// GET /posts/1 — verify a specific resource was fetched with 2xx
const assertGetPostRequest = Task(() => {
  AssertRequest(`${API}/posts/1`)
    .method('GET')
    .status('2xx')
}).as('Assert GET /posts/1')

// POST /posts — verify method + JSON body subset + 201 Created
const assertCreatePostRequest = Task(() => {
  AssertRequest(`${API}/posts`)
    .method('POST')
    .jsonBody({ title: 'Tomation', userId: 1 })
    .status(201)
}).as('Assert POST /posts')

// Negative: a DELETE was never issued
const assertNoDeleteRequest = Task(() => {
  AssertRequest({ glob: `${API}/posts/*` })
    .method('DELETE')
    .notMade()
}).as('Assert no DELETE was made')

// Count: exactly one create call happened
const assertCreateCalledOnce = Task(() => {
  AssertRequest(`${API}/posts`)
    .method('POST')
    .times(1)
}).as('Assert POST /posts happened once')

export default {
  loadPostsButton, getPostButton, createPostButton, result, status,
  loadPosts, getPost, createPost,
  assertPostsListRequest, assertGetPostRequest, assertCreatePostRequest,
  assertNoDeleteRequest, assertCreateCalledOnce,
}
