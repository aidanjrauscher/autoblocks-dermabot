const fs = require("fs")
const path = require("path")
const { encoding_for_model } = require("@dqbd/tiktoken")
const { createClient } = require("@supabase/supabase-js")
const { Configuration, OpenAIApi } = require("openai-edge")
require("dotenv").config()

const main = async ()=>{
    //instantiate supabase and openai client
    const supabase = await createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET)

    const configuration = new Configuration({
        apiKey: process.env.OPENAI_API_KEY
    })
    const openai = new OpenAIApi(configuration)
    //read and split knowledge doc
    const filePath = path.join(path.dirname(__dirname), "data", "Knowledge.txt")
    const file = fs.readFileSync(filePath, 'utf-8')
    var sections = file.split("\n\n")
    sections = sections.map(chunk => chunk.trim())


    var chunks = []
    const enc = encoding_for_model("gpt2")
    //generate embeddings and create chunks
    for(i in sections)
    {
        //generate openai embedding
        const section = sections[i]
        if(section.length > 3)
        {
            const res = await openai.createEmbedding({
                input: section,
                model: "text-embedding-ada-002"
            })
            const json = await res.json()
            const embedding = json.data[0].embedding
            //add chunk
            chunks.push({
                content: section,
                content_length: section.length, 
                token_length: enc.encode(section).length,
                embedding 
            })
        }
        await new Promise(resolve => setTimeout(resolve, 100)); 
    }
    //upload chunks to supabase
    const { data, error } = await supabase
        .from('context')
        .insert(chunks)

    if(!error)
    {
        console.log("DATA SUCCESFULLY PROCESSED!")
    }
}

main()