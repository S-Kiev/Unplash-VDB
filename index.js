import OpenAI from "openai";
import { config } from "dotenv";
import { Index } from "@upstash/vector";
config();

const openai = new OpenAI({
    apiKey: 'your-apu-key'
});

const index = new Index({
    url: process.env.UPSTASH_VECTOR_REST_URL,
    token: process.env.UPSTASH_VECTOR_REST_TOKEN,
});

async function generateEmbeddings(text) {
    try {
        const response = await openai.embeddings.create({
            input: text,
            model: "text-embedding-3-large",
            dimensions: 256
        });
        if (response.data && response.data.length > 0 && response.data[0].embedding) {
            return response.data[0].embedding;
        } else {
            console.error("estructura de respuesta no esperada:", JSON.stringify(response, null, 2));
            throw new Error("estructura de respuesta no esperada, no se encontraron embeddings");
        }
    } catch (error) {
        console.error("Error al generar embeddings:", error);
        throw error;
    }
}

async function splitTextAndUpsert(id, text, chunkSize = 1000){
    console.log(`Insercion de registros para el Id: ${id}`);
    const chunks = text.match(new RegExp(".{1," + chunkSize + "}", "g")) || [];
    for (let i = 0; i < chunks.length; i++) {
        const chunkId = `${id}-${i + 1}`;
        console.log(`Insertando registro con el Id: ${chunkId}, texto: ${chunks[i]}`);
        const embedding = await generateEmbeddings(chunks[i]);
        console.log(embedding);
        await index.upsert({
            id: chunkId,
            vector: embedding,
            metadata: {
                text: chunks[i]
            }
        });
        console.log(`Registro insertado con el Id: ${chunkId}, texto: ${chunks[i]}`);
    }
}
async function queryByText(queryText, topK = 3){
    const queryEmbedding = await generateEmbeddings(queryText);
    try {
        const result  = await index.query({
            vector: queryEmbedding,
            topK: topK,
            includeValues: true,
            includeMetadata: true
        });
        console.log("Resultado de la consulta:", JSON.stringify(result, null, 2));
        return result;
    } catch (error) {
        console.error("Error al realizar la consulta:", error);
        throw error;
    }
}

async function sendResultsToOpenai (query){
    const result = await queryByText(query);
    console.log("Resultados de la consulta:", JSON.stringify(result));
    const chatCompletion = await openai.chat.completions.create({
        messages: [{
            role: "system",
            content: "Eres un sistema de recuperacion de argumentos de embeddings. Respondele a la consulta de la persona en base a la informacion proporcioanda del texto",

        },
        {
            role: "user",
            content: `Pregunta: ${query} \n Informacion del texto: ${JSON.stringify(result)}`
        }
    ],
        model: "gpt-3.5-turbo"
    });
    console.log("Respuesta de OpenAI:", chatCompletion.choices[0].message.content);
    return chatCompletion.choices[0].message.content;
}

async function demoFunctions(){
    //await splitTextAndUpsert("Camello", "Los camellos puden reistir mucho tiempo en el desierto sin agua ni comida");
    //await splitTextAndUpsert("Perro", "Los perros tienen un gran sentido del olfato y de audicion, pero no asi de vista");
    //await splitTextAndUpsert("Gato", "Los gatos siempre caen de pie y tienen un gran sentido de la vista");
   // await splitTextAndUpsert("Oso", "Los osos viven en norteamerica comiendo ballas y salmon");
    const query = "Que animal puede sobrevivir en el desierto?";
    console.log(`Performance de similaridad para: ${query}`);
    //await queryByText(query, 3);
    console.log(`Enviando los embeddings a OpenAI para su procesamiento`);
    await sendResultsToOpenai(query);
}

demoFunctions().catch((error) => {
    console.error("Error:", error);
});