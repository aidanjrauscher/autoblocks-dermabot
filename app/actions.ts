'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { kv } from '@vercel/kv'
import { auth } from '@/auth'
import { type Chat } from '@/lib/types'
import { OpenAIApi } from 'openai-edge'
import { AutoblocksTracer } from '@autoblocks/client'
import { AutoblocksPromptBuilder } from '@autoblocks/client/prompts'
import { PromptTrackingId } from '@/lib/prompts'

export async function getChats(userId?: string | null) {
  if (!userId) {
    return []
  }

  try {
    const pipeline = kv.pipeline()
    const chats: string[] = await kv.zrange(`user:chat:${userId}`, 0, -1, {
      rev: true
    })

    for (const chat of chats) {
      pipeline.hgetall(chat)
    }

    const results = await pipeline.exec()
    return results as Chat[]
  } catch (error) {
    return []
  }
}

export async function getChat(id: string, userId: string) {
  const chat = await kv.hgetall<Chat>(`chat:${id}`)
  if (!chat || (userId && chat.userId != userId)) {
    return null
  }
  //filter out system prompt
  chat.messages = chat.messages.filter(m => m.role != "system")
  return chat
}

export async function removeChat({ id, path }: { id: string; path: string }) {
  const session = await auth()

  if (!session) {
    return {
      error: 'Unauthorized'
    }
  }

  const uid = await kv.hget<string>(`chat:${id}`, 'userId')

  if (uid !== session?.user?.id) {
    return {
      error: 'Unauthorized'
    }
  }

  await kv.del(`chat:${id}`)
  await kv.zrem(`user:chat:${session.user.id}`, `chat:${id}`)

  revalidatePath('/')
  return revalidatePath(path)
}

export async function clearChats() {
  const session = await auth()

  if (!session?.user?.id) {
    return {
      error: 'Unauthorized'
    }
  }

  const chats: string[] = await kv.zrange(`user:chat:${session.user.id}`, 0, -1)
  if (!chats.length) {
  return redirect('/')
  }
  const pipeline = kv.pipeline()

  for (const chat of chats) {
    pipeline.del(chat)
    pipeline.zrem(`user:chat:${session.user.id}`, chat)
  }

  await pipeline.exec()

  revalidatePath('/')
  return redirect('/')
}

export async function getSharedChat(id: string) {
  const chat = await kv.hgetall<Chat>(`chat:${id}`)

  if (!chat || !chat.sharePath) {
    return null
  }

  return chat
}

export async function shareChat(chat: Chat) {
  const session = await auth()

  if (!session?.user?.id || session.user.id !== chat.userId) {
    return {
      error: 'Unauthorized'
    }
  }

  const payload = {
    ...chat,
    sharePath: `/share/${chat.id}`
  }

  await kv.hmset(`chat:${chat.id}`, payload)

  return payload
}

export async function ExtractChatName(prompt: string){
  return ""
}

export async function ExtractChatTags(openai: OpenAIApi, prompt: string, extractSpanId: string, tracer: AutoblocksTracer){
  const builder = new AutoblocksPromptBuilder(PromptTrackingId.EXTRACT)
  const messages : any = [
    {
      //content: builder.build('extract/system.txt', {}),
      content: `
      Given a string, introducing you to a new user, return a comma-separated list of the tags used to describe them. If you cannot find any such tags, return 'null'.

      For example, given the input: 
      ‘Hey Stratum, meet John. They are a 24 year old male who’s email address is johnsmith@gmail.com, phone number is 867-5309, and home address is 1234 Main Street Drive. They filled out the Stratum onboarding questionnaire and their answers from the form suggest they have the following skin tags: Fair, Dry, and Mild Sensitive. Introduce yourself to them as their personal skincare assistant.’

      You should return: 
      Fair, Dry, Mild Sensitive

      Remember, if the string includes no valid tags, return 'null'.
      `,
      role: 'system'
    },
    {
      content: prompt,
      role: 'user'
    }
  ]

  const completionConfig = {
    model: 'gpt-3.5-turbo',
    messages,
    temperature: 0.3,
  }

  await tracer.sendEvent('ai.extract.tags.completion', {
    spanId: `${extractSpanId}-a`,
    parentSpanId: extractSpanId,
    properties: {
      ...completionConfig
    },
    promptTracking: builder.usage(),
  });

  const res = await openai.createChatCompletion(completionConfig)

  const data = await res.json()
  const tags = data.choices[0].message.content

  await tracer.sendEvent('ai.extract.tags.result', {
    spanId: `${extractSpanId}-b`,    
    parentSpanId: extractSpanId,
    properties: {
      tags
    }
  });

  return tags
}
