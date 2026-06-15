// recommend Edge Function
// Spoiler-free "should I watch this?" via Pinecone vector search.
// Each game's vibe (close finish, comeback, rivalry, blowout …) is embedded
// into Pinecone. Given a user taste vector, we return the top-K games they'd
// most enjoy — client resolves game details from Supabase using the game_id
// in each match's metadata.
//
// Required secret (set via `supabase secrets set`):
//   PINECONE_API_KEY
import { Pinecone } from 'https://esm.sh/@pinecone-database/pinecone'

const pc = new Pinecone({ apiKey: Deno.env.get('PINECONE_API_KEY')! })
const index = pc.index('games')

Deno.serve(async (req) => {
  const { userVector, topK = 10 } = await req.json()

  if (!Array.isArray(userVector)) {
    return Response.json({ error: 'userVector must be a number[]' }, { status: 400 })
  }

  const result = await index.query({
    vector: userVector,
    topK,
    includeMetadata: true,
  })

  return Response.json({ matches: result.matches })
})
