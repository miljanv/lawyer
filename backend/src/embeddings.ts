import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getEmbedding(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });

  return res.data[0].embedding;
}

export async function askAI(
  question: string,
  context: string,
): Promise<string> {
  const res = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: `
Odgovaraj ISKLJUCIVO na osnovu dostavljenog teksta.
Ako odgovor nije pronadjen u tekstu, odgovori tacno: "Nisam nasao odgovor u dostavljenom dokumentu."
`,
      },
      {
        role: "user",
        content: `
Question: ${question}

Context:
${context}
`,
      },
    ],
  });

  return res.choices[0].message.content || "";
}
