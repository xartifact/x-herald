#!/usr/bin/env node
/**
 * Simple example of using the Anthropic API
 * Usage: node basic-example.js
 */

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

async function main() {
  console.log('Creating a basic message...\n')

  const message = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: 'Explain quantum computing in simple terms.',
      },
    ],
  })

  console.log('Response:', message.content[0].text)
  console.log('\nUsage:', message.usage)
  console.log('Stop reason:', message.stop_reason)
}

main().catch(console.error)
