# Stratum: a dermatology chatbpt

### Overview


### Required
1. A supabase table configured for vector storage and search (pgvector extension, embedding index, and similarity search function)
2. A Vercel KV Database
3. An Autoblocks account for logging
4. A GitHub account for authentication


### To get started
1. Clone repository
2. Download packages with `npm install`
3. Set environment variables
4. Start app locally with `npm run local`


### To add your own data 
1. Create a file in `/app/data/` called Knowledge.txt
2. Add your desired context. Separate logical chunks with two newlines (or change split character in the process.js)
3. Point supabase at the correct table in process.js (and the chat API route)
4. Chunk, embed, and store the data with command: `npm run process`
5. Additionally, to set a custom system prompt, create a file in `/app/prompts/SystemPrompt.txt`

### Possible enhancements 
1. Extract user's name from initial message and set it as default chat name 
1. Ability to rename chats
2. Upload and process docs from UI
