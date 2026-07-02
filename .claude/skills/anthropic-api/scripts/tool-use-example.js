#!/usr/bin/env node
/**
 * Example of tool use (function calling)
 * Usage: node tool-use-example.js
 */

import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Define a simple weather tool
const tools = [
  {
    name: 'get_weather',
    description: 'Get the current weather in a given location',
    input_schema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city and state, e.g. San Francisco, CA',
        },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'The unit of temperature',
        },
      },
      required: ['location'],
    },
  },
]

// Mock weather function
function getWeather(location, unit = 'fahrenheit') {
  // In real implementation, call actual weather API
  return JSON.stringify({
    location,
    temperature: unit === 'celsius' ? 22 : 72,
    unit,
    conditions: 'Sunny',
  })
}

async function main() {
  console.log('Asking about weather...\n')

  const messages = [
    {
      role: 'user',
      content: 'What is the weather like in San Francisco?',
    },
  ]

  // First request - Claude decides to use tool
  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages,
    tools,
  })

  console.log('Initial response stop_reason:', response.stop_reason)

  if (response.stop_reason === 'tool_use') {
    // Find tool use block
    const toolUse = response.content.find((block) => block.type === 'tool_use')

    console.log('Tool called:', toolUse.name)
    console.log('Tool input:', toolUse.input)

    // Execute tool
    const toolResult = getWeather(toolUse.input.location, toolUse.input.unit)

    console.log('Tool result:', toolResult)

    // Send tool result back to Claude
    messages.push({ role: 'assistant', content: response.content })
    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: toolResult,
        },
      ],
    })

    // Get final response
    const finalResponse = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages,
      tools,
    })

    console.log('\nFinal response:', finalResponse.content[0].text)
  }
}

main().catch(console.error)
