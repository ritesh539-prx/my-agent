require('dotenv').config();
const { Telegraf } = require('telegraf');
const Groq = require('groq-sdk');
const express = require('express');

// 🚨 APNI PERSONAL CHAT ID YAHAN PASTE KAR DE BHAI
const RITESH_PERSONAL_CHAT_ID = '6846541775'; 

const BOT_TOKEN = process.env.TELE_BOT_KEY ? process.env.TELE_BOT_KEY.replace(/\\r|\\n/g, '').trim() : null;
const GROQ_API_KEY = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.replace(/\\r|\\n/g, '').trim() : null;

if (!BOT_TOKEN || !GROQ_API_KEY) {
    console.error("❌ ERROR: Keys are missing in .env!");
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const groq = new Groq({ apiKey: GROQ_API_KEY });

const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Organic Story Memory Engine Active! 🗣️🔥'));
app.listen(PORT, () => console.log(`📡 Health-check active on port ${PORT}`));

// Memory Storage
const userLongTermMemory = {};
const activeChatContext = {};
const memoryMessageTracker = {}; 

// 🗣️ REFINED CHAT INSTRUCTION (Sensible Hinglish + Controlled Slang)
const CHAT_INSTRUCTION = 
    `You are a chill, sharp-witted Indian college guy inside a Telegram group. You are a passionate 3D Artist into Blender, texturing, and scripting.\n\n` +
    `🗣️ TONE & LANGUAGE RULES (CRITICAL):\n` +
    `1. Speak in clean, natural, everyday Indian Hinglish (how real college friends text on WhatsApp).\n` +
    `2. Use slangs like 'chutiya', 'bakchod', 'scene', 'lafda', 'bc', 'bhai' ONLY when it fits naturally into the context or banter. DO NOT force slang words into every sentence or out of nowhere.\n` +
    `3. Keep your reply sensible, coherent, and directly relevant to what the user said.\n` +
    `4. Use the provided USER CONTINUOUS STORY & MEMORY to keep the conversation personalized and grounded.\n` +
    `5. Reply in normal text only (no JSON format).`;

// 🧠 STORY & CONTEXT MEMORY COMPILER INSTRUCTION
const STORY_COMPILER_INSTRUCTION =
    `You are a Continuous Memory Aggregator. Your task is to update the continuous background story/description of a user based on their past story and their latest message.\n\n` +
    `CRITICAL RULES:\n` +
    `1. Write a clear, continuous descriptive narrative (paragraph style) summarizing who the user is, what they are currently doing, their mood, recent topics discussed, and active projects/events.\n` +
    `2. Integrate EVERY new interaction—even casual banter, jokes, or random questions—into the updated narrative story.\n` +
    `3. Keep it well-written, factual to what user said, and under 100-150 words.\n` +
    `4. Output ALWAYS in strict JSON format:\n` +
    `{\n  "updated_story": "the newly updated complete background narrative story of the user"\n}`;

async function updateLiveMemoryOnTelegram(userId, userName) {
    try {
        const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        let oldMessageId = memoryMessageTracker[userId];

        if (oldMessageId) {
            try {
                await bot.telegram.deleteMessage(RITESH_PERSONAL_CHAT_ID, oldMessageId);
            } catch (e) {
                // Ignore if deletion window passed
            }
        }

        const storyText = userLongTermMemory[userId];
        const payload = `🧠 [LIVE USER STORY PROFILE]\n👤 User: ${userName} (ID: ${userId})\n⏰ Last Sync: ${timestamp}\n\n📖 Ongoing Narrative Memory:\n${storyText}`;

        const sentMessage = await bot.telegram.sendMessage(RITESH_PERSONAL_CHAT_ID, payload);
        memoryMessageTracker[userId] = sentMessage.message_id;

    } catch (err) {
        console.error("❌ Failed to sync story profile to DM:", err.message);
    }
}

bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    const userId = ctx.message.from.id;
    const userName = ctx.message.from.first_name || 'Bhai';
    const chatId = ctx.chat.id;
    const rawMessage = ctx.message.text;
    const userMessageText = rawMessage.toLowerCase();
    const BOT_USERNAME = 'three_dimen_group_bot';

    const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
    
    let isMentioned = ctx.message.entities?.some(e => e.type === 'mention' && rawMessage.substring(e.offset, e.offset + e.length).toLowerCase() === `@${BOT_USERNAME.toLowerCase()}`);
    const isReplyToBot = ctx.message.reply_to_message?.from.username === BOT_USERNAME;
    const keywords = ['bot', 'manager', 'danish', 'three_dimen_group_bot', 'bhai'];
    const containsName = keywords.some(k => userMessageText.includes(k));

    if (isGroup && !isMentioned && !isReplyToBot && !containsName) return;

    try {
        await ctx.sendChatAction('typing');

        // Initial default story memory state
        if (!userLongTermMemory[userId]) {
            userLongTermMemory[userId] = `${userName} started conversation with the bot. No prior detailed interactions recorded yet.`;
        }
        if (!activeChatContext[chatId]) {
            activeChatContext[chatId] = [];
        }

        // --- PIPELINE 1: GENERATE ORGANIC CHAT REPLY ---
        const currentMemoryProfile = `[USER CONTINUOUS STORY & MEMORY]:\n${userLongTermMemory[userId]}`;
        
        const messagesToSend = [
            { role: 'system', content: `${CHAT_INSTRUCTION}\n\n${currentMemoryProfile}` },
            ...activeChatContext[chatId],
            { role: 'user', content: rawMessage }
        ];

        const chatCompletion = await groq.chat.completions.create({
            messages: messagesToSend,
            model: 'llama-3.1-8b-instant',
            temperature: 0.6 // Controlled creativity for sensible Hinglish
        });

        const aiReply = chatCompletion.choices[0]?.message?.content;

        if (aiReply) {
            activeChatContext[chatId].push({ role: 'user', content: rawMessage });
            activeChatContext[chatId].push({ role: 'assistant', content: aiReply });
            
            // Keeping last 8 messages in chat history for solid short-term context
            if (activeChatContext[chatId].length > 8) {
                activeChatContext[chatId].shift(); 
                activeChatContext[chatId].shift();
            }
            await ctx.reply(aiReply, { reply_to_message_id: ctx.message.message_id });
        }

        // --- PIPELINE 2: ALWAYS-ON STORY MEMORY UPDATER ---
        const memoryCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: STORY_COMPILER_INSTRUCTION },
                { role: 'user', content: `[PREVIOUS USER STORY]:\n${userLongTermMemory[userId]}\n\n[LATEST USER MESSAGE]:\n"${rawMessage}"` }
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.2, 
            response_format: { type: "json_object" }
        });

        const rawJsonOutput = memoryCompletion.choices[0]?.message?.content;

        if (rawJsonOutput) {
            const parsedData = JSON.parse(rawJsonOutput);
            if (parsedData && parsedData.updated_story) {
                userLongTermMemory[userId] = parsedData.updated_story.trim();
                await updateLiveMemoryOnTelegram(userId, userName);
            }
        }
    } catch (error) {
        console.error("Engine Error:", error);
    }
});

bot.launch().then(() => console.log("🚀 Organic Story-Memory Engine Active...")).catch(err => console.error("❌ Launch Failed:", err.message));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));