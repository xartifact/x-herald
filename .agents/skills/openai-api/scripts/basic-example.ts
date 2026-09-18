/**
 * OpenAI API Basic Example
 * Simple chat completion request
 */

const API_KEY = process.env.OPENAI_API_KEY
const API_URL = 'https://api.openai.com/v1/chat/completions'

interface ChatCompletionResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

async function chatCompletion(): Promise<void> {
  if (!API_KEY) {
    console.error('Error: OPENAI_API_KEY environment variable is required')
    process.exit(1)
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the capital of France?' },
      ],
      temperature: 0.7,
      max_tokens: 150,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    console.error('API Error:', error)
    process.exit(1)
  }

  const data: ChatCompletionResponse = await response.json()

  console.log('Response:')
  console.log(data.choices[0].message.content)
  console.log('\nUsage:')
  console.log(`  Prompt tokens: ${data.usage.prompt_tokens}`)
  console.log(`  Completion tokens: ${data.usage.completion_tokens}`)
  console.log(`  Total tokens: ${data.usage.total_tokens}`)
}

chatCompletion().catch(console.error)
