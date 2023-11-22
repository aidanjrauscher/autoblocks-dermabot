import { OpenAIApi } from 'openai-edge'
import supabase from './supabase'
 
export async function VectorSearch(openai: OpenAIApi, query: string){
    const res = await openai.createEmbedding({
        input: query,
        model: "text-embedding-ada-002",
    })
    const json = await res.json()
    const embedding = json.data[0].embedding
    const { data } = await supabase.rpc('retrieve_context', {
        query_embedding: embedding,
        match_threshold: 0.81, // Choose an appropriate threshold for your data
        match_count: 4, // Choose the number of matches
      })
    
    if(data)
    {
        return data.map((result: { content: any }) => result.content)
    }
    else{
        return []
    }
}