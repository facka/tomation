import { Test, Navigate, Wait, AssertHasText } from '@tomationjs/dsl'
import Network from '~/pom/network.pom'

Test('GET request with query params is captured and asserted', () => {
  Navigate('network/index.html')
  Wait(300)
  Network.loadPosts()
  Wait(800)
  AssertHasText(Network.status, '200')
  Network.assertPostsListRequest()
})

Test('GET a single resource returns 2xx', () => {
  Navigate('network/index.html')
  Wait(300)
  Network.getPost()
  Wait(800)
  Network.assertGetPostRequest()
})

Test('POST request body and 201 status are captured', () => {
  Navigate('network/index.html')
  Wait(300)
  Network.createPost()
  Wait(800)
  AssertHasText(Network.status, '201')
  Network.assertCreatePostRequest()
  Network.assertCreateCalledOnce()
})

Test('No DELETE request is made during the flow', () => {
  Navigate('network/index.html')
  Wait(300)
  Network.loadPosts()
  Wait(500)
  Network.getPost()
  Wait(800)
  Network.assertNoDeleteRequest()
})
