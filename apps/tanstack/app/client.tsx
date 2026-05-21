import { StartClient, mount } from '@tanstack/start/client'
import { createRouter } from './router'

mount('#root', () => {
  const router = createRouter()
  return <StartClient router={router} />
})
