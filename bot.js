require('dotenv').config();
const { Telegraf } = require('telegraf');
const Groq = require('groq-sdk');
const express = require('express');

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
app.get('/', (req, res) => res.send('Autonomous Memory & Chat Engine Active! 🗣️🔥'));
app.listen(PORT, () => console.log(`📡 Health-check active on port ${PORT}`));

// Storage & Memory Structures
const userCoreMemory = {};       
const userRecentChats = {};        
const userFreshMemory = {};        
const memoryMessageTracker = {}; 

// Message Buffer for 5-Second Interval Processing
let chatBuffer = []; 

// 🧠 AUTONOMOUS BATCH ENGINE INSTRUCTION
const ENGINE_INSTRUCTION = 
    `You are 'Danish' (@three_dimen_group_bot), the intelligent Group Manager of a 3D Artist Telegram Community.\n` +
    `You are reading a recent batch of raw chat messages from the group.\n\n` +
    `YOUR TWO CORE DUTIES:\n` +
    `1. MEMORY ANALYSIS: Analyze what users are discussing, their active interests, questions, or context, and extract insights for each user.\n` +
    `2. CONVERSATIONAL JUDGMENT: Decide if you should chime into the chat.\n` +
    `   - Set "should_respond": true ONLY IF someone directly addressed you, mentioned you, asked a question relevant to group/3D/Blender, or if a natural entry point exists where a chill friend would chime in.\n` +
    `   - Otherwise set "should_respond": false.\n\n` +
    `RESPONSE STYLE RULES (if should_respond is true):\n` +
    `- Natural Indian Hinglish (like WhatsApp group banter).\n` +
    `- Direct, relevant, short, concise. Never use generic or robotic filler.\n` +
    `- Keep persona as 'Danish' (chill Indian group manager).\n\n` +
    `OUTPUT FORMAT REQUIREMENTS:\n` +
    `Return ONLY a JSON object with this exact structure:\n` +
    `{\n` +
    `  "memory_updates": [\n` +
    `    {\n` +
    `      "userId": "123456",\n` +
    `      "userName": "Name",\n` +
    `      "core_story": "Updated long term background summary of user based on chat",\n` +
    `      "fresh_memory": "Instant takeaway from their latest statements"\n` +
    `    }\n` +
    `  ],\n` +
    `  "should_respond": true,\n` +
    `  "target_message_id": "message_id_to_reply_to_if_any_else_null",\n` +
    `  "response_text": "Your Hinglish reply here"\n` +
    `}`;

async function syncStructuredMemoryToTelegram(userId, userName) {
    try {
        const timestamp = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        let oldMessageId = memoryMessageTracker[userId];

        if (oldMessageId) {
            try {
                await bot.telegram.deleteMessage(RITESH_PERSONAL_CHAT_ID, oldMessageId);
            } catch (e) {}
        }

        const core = userCoreMemory[userId] || "No prior core story recorded.";
        const fresh = userFreshMemory[userId] || "No instant insights yet.";
        const recentLogs = (userRecentChats[userId] || [])
            .map(item => `${item.sender}: ${item.text}`)
            .join('\n');

        const payload = 
            `🧠 [LIVE USER PROFILE & CONTEXT CARD]\n` +
            `👤 User: ${userName} (ID: ${userId})\n` +
            `⏰ Last Sync: ${timestamp}\n\n` +
            `📖 1. CORE LONG-TERM STORY:\n${core}\n\n` +
            `💬 2. RECENT CHAT LOG:\n${recentLogs || "No recent history log."}\n\n` +
            `⚡ 3. FRESH / INSTANT MEMORY:\n${fresh}`;

        const sentMessage = await bot.telegram.sendMessage(RITESH_PERSONAL_CHAT_ID, payload);
        memoryMessageTracker[userId] = sentMessage.message_id;
    } catch (err) {
        console.error("❌ DM Memory Sync Error:", err.message);
    }
}

// 🎉 WELCOME NEW MEMBERS HANDLER
bot.on('new_chat_members', async (ctx) => {
    try {
        const newMembers = ctx.message.new_chat_members;
        for (const member of newMembers) {
            if (member.is_bot && member.username === 'three_dimen_group_bot') continue;
            const memberName = member.first_name || 'Artist';
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

// 📥 COLLECT ALL MESSAGES IN BUFFER (NO TRIGGER KEYWORDS REQUIRED)
bot.on('text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return;

    const userId = ctx.message.from.id;
    const userName = ctx.message.from.first_name || 'User';
    const rawMessage = ctx.message.text;
    const msgId = ctx.message.message_id;
    const chatId = ctx.chat.id;

    // Initialize structures
    if (!userCoreMemory[userId]) userCoreMemory[userId] = `${userName} joined group conversations.`;
    if (!userRecentChats[userId]) userRecentChats[userId] = [];
    if (!userFreshMemory[userId]) userFreshMemory[userId] = "Active in group chats.";

    // Track user local recent logs
    userRecentChats[userId].push({ sender: userName, text: rawMessage });
    if (userRecentChats[userId].length > 15) userRecentChats[userId].shift();

    // Push into global 5-second buffer queue
    chatBuffer.push({
        chatId,
        msgId,
        userId,
        userName,
        text: rawMessage,
        time: new Date().toLocaleTimeString('en-IN')
    });
});

// ⏱️ 5-SECOND BATCH PROCESSING ENGINE
setInterval(async () => {
    if (chatBuffer.length === 0) return;

    // Take current batch and empty buffer
    const currentBatch = [...chatBuffer];
    chatBuffer = [];

    try {
        const formattedBatchText = currentBatch.map(m => 
            `[MsgID: ${m.msgId} | UserID: ${m.userId} | ${m.userName}]: "${m.text}"`
        ).join('\n');

        const promptPayload = `CURRENT CHAT BATCH (Last 5 seconds):\n${formattedBatchText}`;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: ENGINE_INSTRUCTION },
                { role: 'user', content: promptPayload }
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.3,
            response_format: { type: "json_object" }
        });

        const rawResult = completion.choices[0]?.message?.content;
        if (!rawResult) return;

        const data = JSON.parse(rawResult);

        // 1. SILENT MEMORY UPDATES
        if (data.memory_updates && Array.isArray(data.memory_updates)) {
            for (const update of data.memory_updates) {
                if (update.userId) {
                    if (update.core_story) userCoreMemory[update.userId] = update.core_story.trim();
                    if (update.fresh_memory) userFreshMemory[update.userId] = update.fresh_memory.trim();
                    await syncStructuredMemoryToTelegram(update.userId, update.userName || 'User');
                }
            }
        }

        // 2. CONVERSATIONAL REPLY IF DECIDED BY AI
        if (data.should_respond && data.response_text) {
            const targetChatId = currentBatch[0].chatId;
            const replyMsgId = data.target_message_id && data.target_message_id !== "null" 
                ? parseInt(data.target_message_id) 
                : currentBatch[currentBatch.length - 1].msgId;

            await bot.telegram.sendMessage(targetChatId, data.response_text, {
                reply_to_message_id: replyMsgId
            });
        }

    } catch (err) {
        console.error("❌ Batch Processing Engine Error:", err.message);
    }
}, 5000);

bot.launch().then(() => console.log("🚀 Autonomous 5s Batch Memory Engine Active...")).catch(err => console.error("❌ Launch Failed:", err.message));
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));