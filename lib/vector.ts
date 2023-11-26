import { OpenAIApi } from 'openai-edge'
import supabase from './supabase'
import { AutoblocksTracer } from '@autoblocks/client'
 
export async function VectorSearch(openai: OpenAIApi, query: string, searchSpanId: string, tracer: AutoblocksTracer){
    
    const completionConfig = {
        input: query,
        model: "text-embedding-ada-002",
    }

    await tracer.sendEvent('ai.vector.search.embed', {
        spanId: `${searchSpanId}-a`,
        parentSpanId: searchSpanId,
        properties: {
          ...completionConfig
        },
    });
    
    const res = await openai.createEmbedding(completionConfig)
    const json = await res.json()
    const embedding = json.data[0].embedding
    const { data } = await supabase.rpc('retrieve_context', {
        query_embedding: embedding,
        match_threshold: 0.81, 
        match_count: 4, 
      })
    
    if(data)
    {
        const context = data.map((result: { content: any }) => result.content)
        await tracer.sendEvent('ai.vector.search.context', {
            spanId: `${searchSpanId}-b`,
            parentSpanId: searchSpanId,
            properties: {
              context
            },
        });
        return context
    }
    else{
        await tracer.sendEvent('ai.vector.search.context', {
            spanId: `${searchSpanId}-b`,
            parentSpanId: searchSpanId,
            properties: {
              context: null
            },
        });
        return []
    }
}