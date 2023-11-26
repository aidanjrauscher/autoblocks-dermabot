import { kv } from '@vercel/kv'
import { OpenAIStream, StreamingTextResponse } from 'ai'
import { Configuration, OpenAIApi } from 'openai-edge'
import { auth } from '@/auth'
import { nanoid } from '@/lib/utils'
import { ExtractChatTags } from '@/app/actions'
import fs from "fs"
import { type Chat } from '@/lib/types'
import { VectorSearch } from '@/lib/vector'
import { AutoblocksTracer } from '@autoblocks/client'
import { AutoblocksPromptBuilder } from '@autoblocks/client/prompts'
import { PromptTrackingId } from '@/lib/prompts'
import crypto from 'crypto'



const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
})

const openai = new OpenAIApi(configuration)

const tracer = new AutoblocksTracer(process.env.AUTOBLOCKS_INGESTION_KEY ?? "", {
  traceId: crypto.randomUUID(),
  properties: {
    provder: "openai",
    route: "chat"
  }
});

export async function POST(req: Request) {
  const json = await req.json()
  const { messages, previewToken } = json
  const userId = (await auth())?.user.id

  const spanId = crypto.randomUUID()


  const requetsStart = Date.now()
  await tracer.sendEvent('ai.request', {
    spanId,
    properties: {
      path: `/chat/${json.id ?? ""}`,
      user: userId,
      messages: messages,
      chatId: json.id ?? null
    },
  });

  if (!userId) {
    return new Response('Unauthorized', {
      status: 401
    })
  }

  if (previewToken) {
    configuration.apiKey = previewToken
  }

  var userMessage : string = ""
  var userTags: string = ""

  if(messages.length == 1)
  {
    //get initial tags
    const extractSpanId = crypto.randomUUID()

    tracer.sendEvent("ai.extract.tags.start", {
      spanId: extractSpanId,
      parentSpanId: spanId
    })

    userTags = await ExtractChatTags(openai, messages[0].content, extractSpanId, tracer);

    tracer.sendEvent("ai.extract.tags.end", {
      spanId: extractSpanId,
      parentSpanId: spanId
    })
  }
  else if (json.id)
  {
    //fetch existing tags
    const chat = await kv.hgetall<Chat>(`chat:${json.id}`)
    userTags = chat?.tags ?? "";
  }

  const builder = new AutoblocksPromptBuilder(PromptTrackingId.CHAT)
  
  //set system prompt
  if(messages.length > 0 && messages[0].role != 'system')
  {
    //const systemPrompt = fs.readFileSync(process.env.SYSTEM_PROMPT_PATH ?? "",  'utf-8')
    messages.unshift({
      role: 'system',
      content: builder.build('chat/system.txt', {})
    });
  }

  if(messages.length > 0)
  {
    userMessage = messages[messages.length-1].content
  }

  //adjust user message and provide context
  if(messages.length > 2)
  {
    const embeddingQuery = `
    ${userMessage}
    
    Tags: ${userTags}
    `
    const searchSpanId = crypto.randomUUID()

    tracer.sendEvent("ai.vector.search.start", {
      spanId: searchSpanId,
      parentSpanId: spanId
    })

    const context: string[] = await VectorSearch(openai, embeddingQuery, searchSpanId, tracer)

    tracer.sendEvent("ai.vector.search.end", {
      spanId: searchSpanId,
      parentSpanId: spanId
    })

    messages[messages.length-1].content = builder.build('chat/user.txt', {
      userTags,
      context: context.join("\n\n"),
      userMessage
    })
  }
  const res = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo-16k',
    messages,
    temperature: 0.7,
    stream: true
  })

  const stream = OpenAIStream(res, {
    async onStart(){
      await tracer.sendEvent('ai.stream.start', {
        spanId: `${spanId}-a`,
        parentSpanId: spanId,
        properties: {
          model: 'gpt-3.5-turbo-16k',
        }
      });
    },
    async onCompletion(completion) {
      const title = json.messages[0].content.substring(0, 100)
      const id = json.id ?? nanoid()
      const createdAt = Date.now()
      const path = `/chat/${id}`
      messages[messages.length-1] = { content: userMessage, role: 'user' }
      const payload = {
        id,
        title,
        userId,
        tags: userTags,
        createdAt,
        path,
        model: 'gpt-3.5-turbo-16k',
        messages: [
          ...messages,
          {
            content: completion,
            role: 'assistant'
          }
        ]
      }
      await kv.hmset(`chat:${id}`, payload)
      await kv.zadd(`user:chat:${userId}`, {
        score: createdAt,
        member: `chat:${id}`
      })
      await tracer.sendEvent('ai.response', {
        spanId,
        properties: {
          ...payload
        },
        promptTracking: builder.usage(),
      });
    }
  })

  return new StreamingTextResponse(stream)
}
