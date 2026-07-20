require('dotenv').config();
const { Telegraf } = require('telegraf');
const Groq = require('groq-sdk');
const express = require('express');

// 🚨 APNI PERSONAL CHAT ID
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
app.get('/', (req, res) => res.send('Structured Memory Engine Active! 🗣️🔥'));
app.listen(PORT, () => console.log(`📡 Health-check active on port ${PORT}`));

// Storage Structure
const userCoreMemory = {};       // 1. Long-Term Core Story Narrative
const userRecentChats = {};        // 2. Previous 10-20 Chats History Log
const userFreshMemory = {};        // 3. Current/Instant Memory Insights from recent chat

const memoryMessageTracker = {}; 

// 🗣️ BULLETPROOF BOT CHAT INSTRUCTION
const CHAT_INSTRUCTION = 
    `You are 'Danish' (@three_dimen_group_bot), the official, chill, and sharp-witted Group Manager of this 3D Artist Telegram Community.\n\n` +
    `🚨 ABSOLUTE IDENTITY LAWS (STRICTLY FOLLOW):\n` +
    `1. YOU ARE THE BOT / GROUP MANAGER. You manage the group, welcome members, discuss 3D arts, and facilitate conversation. You do NOT make 3D models yourself, you do NOT study for college exams, and you do NOT work on projects.\n` +
    `2. Ritesh (and other users) are the HUMAN members/3D artists. Never confuse their tasks as yours.\n` +
    `3. NEVER SAY nonsense lines like "Mai project bana raha hu" or "Maine Blender mein ye banaya".\n` +
    `4. NEVER tag or mention '@three_dimen_group_bot' in your own replies.\n\n` +
    `🎯 CONVERSATION & TONE RULES:\n` +
    `1. Direct & Relevant: Answer ONLY what the user asked or said. Zero useless filler counter-questions or awkward small talk.\n` +
    `2. Natural Hinglish: Speak cleanly like a real Indian college friend on WhatsApp.\n` +
    `3. Controlled Slang: Use 'bhai', 'scene', 'lafda', 'bc', 'chutiya', 'bakchod' ONLY when the context demands banter. Never force slang.\n` +
    `4. Plain Text Output Only: Do not output JSON or code blocks unless explicitly asked.`;

// 🧠 COMPREHENSIVE MEMORY & STORY COMPILER INSTRUCTION
const COMPILER_INSTRUCTION = 
    `You are a Precision Memory Engine. Analyze the user's PREVIOUS CORE STORY, RECENT CHAT LOG, and LATEST MESSAGE, then update all 3 memory sections.\n\n` +
    `RULES FOR OUTPUT:\n` +
    `1. "core_story": Update the continuous long-term descriptive background narrative of the user (under 120 words).\n` +
    `2. "fresh_memory": Extract instant insights/details specifically from the latest conversation (e.g. current mood, immediate topic, active question).\n` +
    `3. Output MUST be valid JSON in this EXACT structure:\n` +
    `{\n` +
    `  "core_story": "updated long term story description",\n` +
    `  "fresh_memory": "insights from the latest interaction"\n` +
    `}`;

async function syncStructuredMemoryToTelegram(userId, userName) {
    try {
        const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        let oldMessageId = memoryMessageTracker[userId];

        if (oldMessageId) {
            try {
                await bot.telegram.deleteMessage(RITESH_PERSONAL_CHAT_ID, oldMessageId);
            } catch (e) {
                // Ignore if deletion failed or expired
            }
        }

        const core = userCoreMemory[userId] || "No prior core story recorded.";
        const fresh = userFreshMemory[userId] || "No instant insights yet.";
        
        // Format previous chats log (Recent 10-15 messages)
        const recentLogs = (userRecentChats[userId] || [])
            .map(item => `${item.sender}: ${item.text}`)
            .join('\n');

        const payload = 
            `🧠 [LIVE USER PROFILE & CONTEXT CARD]\n` +
            `👤 User: ${userName} (ID: ${userId})\n` +
            `⏰ Last Sync: ${timestamp}\n\n` +
            `📖 1. CORE LONG-TERM STORY:\n${core}\n\n` +
            `💬 2. RECENT CHAT LOG (Previous Interactions):\n${recentLogs || "No recent history log."}\n\n` +
            `⚡ 3. FRESH / INSTANT MEMORY:\n${fresh}`;

        const sentMessage = await bot.telegram.sendMessage(RITESH_PERSONAL_CHAT_ID, payload);
        memoryMessageTracker[userId] = sentMessage.message_id;

    } catch (err) {
        console.error("❌ Failed to sync structured profile to DM:", err.message);
    }
}

// 🎉 NEW MEMBER WELCOME HANDLER
bot.on('new_chat_members', async (ctx) => {
    try {
        const newMembers = ctx.message.new_chat_members;

        for (const member of newMembers) {
            // Agar bot khud add hua hai toh ignore karega
            if (member.is_bot && member.username === 'three_dimen_group_bot') continue;

            const memberName = member.first_name || 'Artist';

            // Custom Welcome Message
            const welcomeText = 
                `Welcome to the group, ${memberName}! 🎉\n\n` +
                `Main hu **Danish** (@three_dimen_group_bot), tumhara Group Manager. ` +
                `Ye 3D Artists ka community space hai jahan hum Blender, Texturing, Animation aur Scripting discuss karte hain.\n\n` +
                `Apna intro do aur batao kis 3D software pe kaam kar rahe ho! 🚀`;

            await ctx.reply(welcomeText, { reply_to_message_id: ctx.message.message_id });
        }
    } catch (err) {
        console.error("❌ Welcome Handler Error:", err.message);
    }
});

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

        // Initialize user structures
        if (!userCoreMemory[userId]) {
            userCoreMemory[userId] = `${userName} started conversation with the bot.`;
        }
        if (!userRecentChats[userId]) {
            userRecentChats[userId] = [];
        }
        if (!userFreshMemory[userId]) {
            userFreshMemory[userId] = "New interaction initiated.";
        }

        // Add user message to recent chat log
        userRecentChats[userId].push({ sender: userName, text: rawMessage });
        if (userRecentChats[userId].length > 15) { // Keeps latest 15 messages max
            userRecentChats[userId].shift();
        }

        // --- PIPELINE 1: GENERATE ORGANIC REPLY ---
        const contextMemoryPayload = 
            `[USER CORE LONG-TERM STORY]:\n${userCoreMemory[userId]}\n\n` +
            `[FRESH INSTANT MEMORY]:\n${userFreshMemory[userId]}`;

        // Build last 10 messages context for direct chat fluidity
        const formattedHistory = userRecentChats[userId].map(m => ({
            role: m.sender === userName ? 'user' : 'assistant',
            content: m.text
        }));

        const messagesToSend = [
            { role: 'system', content: `${CHAT_INSTRUCTION}\n\n${contextMemoryPayload}` },
            ...formattedHistory
        ];

        const chatCompletion = await groq.chat.completions.create({
            messages: messagesToSend,
            model: 'llama-3.1-8b-instant',
            temperature: 0.6
        });

        const aiReply = chatCompletion.choices[0]?.message?.content;

        if (aiReply) {
            // Add bot reply to recent chat log
            userRecentChats[userId].push({ sender: 'Danish (Bot)', text: aiReply });
            if (userRecentChats[userId].length > 15) {
                userRecentChats[userId].shift();
            }

            await ctx.reply(aiReply, { reply_to_message_id: ctx.message.message_id });
        }

        // --- PIPELINE 2: UPDATE STRUCTURED DM MEMORY ---
        const memoryCompletion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: COMPILER_INSTRUCTION },
                { role: 'user', content: `[PREVIOUS CORE STORY]:\n${userCoreMemory[userId]}\n\n[LATEST USER MESSAGE]:\n"${rawMessage}"` }
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.2, 
            response_format: { type: "json_object" }
        });

        const rawJsonOutput = memoryCompletion.choices[0]?.message?.content;

        if (rawJsonOutput) {
            const parsedData = JSON.parse(rawJsonOutput);
            if (parsedData) {
                if (parsedData.core_story) userCoreMemory[userId] = parsedData.core_story.trim();
                if (parsedData.fresh_memory) userFreshMemory[userId] = parsedData.fresh_memory.trim();
                
                // Sync all 3 parts to personal DM
                await syncStructuredMemoryToTelegram(userId, userName);
            }
        }
    } catch (error) {
        console.error("Engine Error:", error);
    }
});

bot.launch().then(() => console.log("🚀 Structured DM Memory Engine Active...")).catch(err => console.error("❌ Launch Failed:", err.message));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));