require('dotenv').config();
const { Telegraf } = require('telegraf');
const Groq = require('groq-sdk');
const express = require('express');
const mongoose = require('mongoose');

const RITESH_PERSONAL_CHAT_ID = '6846541775';
const BOT_USERNAME = 'three_dimen_group_bot'; // no @

const BOT_TOKEN = process.env.TELE_BOT_KEY ? process.env.TELE_BOT_KEY.replace(/\\r|\\n/g, '').trim() : null;
const GROQ_API_KEY = process.env.GROQ_API_KEY ? process.env.GROQ_API_KEY.replace(/\\r|\\n/g, '').trim() : null;
const MONGODB_URI = process.env.MONGODB_URI ? process.env.MONGODB_URI.trim() : null;

if (!BOT_TOKEN || !GROQ_API_KEY) {
    console.error("❌ ERROR: Keys are missing in .env!");
    process.exit(1);
}
if (!MONGODB_URI) {
    console.error("❌ ERROR: MONGODB_URI is missing in .env! Data won't persist across restarts.");
    process.exit(1);
}

// --- NEW: Mongo schema for per-user persistent memory ---
const userMemorySchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true, index: true },
    userName: { type: String, default: 'User' },
    coreStory: { type: String, default: '' },
    freshMemory: { type: String, default: '' },
    recentChats: { type: [{ sender: String, text: String }], default: [] },
    memoryMessageId: { type: Number, default: null } // last DM sync message id in Ritesh's chat
}, { timestamps: true });

const UserMemory = mongoose.model('UserMemory', userMemorySchema);

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
let botTelegramId = null; // filled after launch

// --- NEW: load all existing user memory from MongoDB into RAM on boot ---
async function loadMemoryFromDB() {
    const allUsers = await UserMemory.find({});
    for (const doc of allUsers) {
        userCoreMemory[doc.userId] = doc.coreStory || `${doc.userName} joined group conversations.`;
        userFreshMemory[doc.userId] = doc.freshMemory || "Active in group chats.";
        userRecentChats[doc.userId] = doc.recentChats || [];
        if (doc.memoryMessageId) memoryMessageTracker[doc.userId] = doc.memoryMessageId;
    }
    console.log(`📦 Loaded memory for ${allUsers.length} user(s) from MongoDB.`);
}

// --- NEW: upsert a single user's memory into MongoDB (called after every update) ---
async function persistUserMemory(userId, userName) {
    try {
        await UserMemory.findOneAndUpdate(
            { userId: String(userId) },
            {
                userId: String(userId),
                userName: userName || 'User',
                coreStory: userCoreMemory[userId] || '',
                freshMemory: userFreshMemory[userId] || '',
                recentChats: userRecentChats[userId] || [],
                memoryMessageId: memoryMessageTracker[userId] || null
            },
            { upsert: true, new: true }
        );
    } catch (err) {
        console.error("❌ Mongo persist error:", err.message);
    }
}

// 🧠 AUTONOMOUS BATCH ENGINE INSTRUCTION (DYNAMIC LANGUAGE ADAPTATION)
const ENGINE_INSTRUCTION =
    `You are 'Danish' (@three_dimen_group_bot), the friendly Group Manager of a 3D Artist Telegram Community.\n` +
    `You are reading a recent batch of raw chat messages from the group.\n\n` +
    `YOUR TWO CORE DUTIES:\n` +
    `1. MEMORY ANALYSIS: Each user is uniquely identified by their Telegram "userId" (not name — names can repeat). You will be shown their EXISTING core_story and fresh_memory for that exact userId. UPDATE and MERGE new info into the existing core_story — never discard prior known facts about that userId unless the new message contradicts them. Think of it as editing a running profile, not rewriting it from zero.\n` +
    `2. CONVERSATIONAL JUDGMENT: Decide if you should chime into the chat.\n` +
    `   - Set "should_respond": true if someone directly addressed you, mentioned you, replied to you (marked with [REPLYING_TO_DANISH]), asked ANY question (3D-related or not), greeted you personally, or made small talk directed at you.\n` +
    `   - Also feel free to reply true for general friendly banter where a chill community manager would naturally jump in — you don't have to restrict yourself to only 3D/Blender topics. You can have normal casual conversations too, not just technical ones.\n` +
    `   - Any message tagged [REPLYING_TO_DANISH] or [MENTIONS_DANISH] MUST get "should_respond": true.\n` +
    `   - Otherwise set "should_respond": false.\n\n` +
    `🚨 LANGUAGE & TONE LAWS (STRICT MATCHING):\n` +
    `- MATCH THE USER'S LANGUAGE: If the user speaks in English, reply strictly in clean, professional yet casual English. If they speak in Hinglish, reply in natural Indian Hinglish.\n` +
    `- NEVER force Hinglish or Hindi words on an English-speaking user.\n` +
    `- Direct, relevant, short, concise, human. Never use generic or robotic filler.\n` +
    `- Keep persona as 'Danish' (chill, knowledgeable, friendly 3D community manager who also enjoys casual chit-chat).\n\n` +
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
    `  "response_text": "Your adaptive language reply here"\n` +
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
            if (member.is_bot && member.username === BOT_USERNAME) continue;
            const memberName = member.first_name || 'Artist';
            const welcomeText =
                `Welcome to the group, ${memberName}! 🎉\n\n` +
                `Main hu **Danish** (@${BOT_USERNAME}), tumhara Group Manager. ` +
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

    // --- NEW: detect if this message is a reply to the bot itself ---
    const isReplyToBot =
        ctx.message.reply_to_message &&
        ctx.message.reply_to_message.from &&
        (ctx.message.reply_to_message.from.id === botTelegramId ||
         ctx.message.reply_to_message.from.username === BOT_USERNAME);

    // --- NEW: detect @mention or plain "Danish" name-drop ---
    const mentionsBot =
        rawMessage.toLowerCase().includes(`@${BOT_USERNAME.toLowerCase()}`) ||
        /\bdanish\b/i.test(rawMessage);

    // Initialize structures
    if (!userCoreMemory[userId]) userCoreMemory[userId] = `${userName} joined group conversations.`;
    if (!userRecentChats[userId]) userRecentChats[userId] = [];
    if (!userFreshMemory[userId]) userFreshMemory[userId] = "Active in group chats.";

    // Track user local recent logs
    userRecentChats[userId].push({ sender: userName, text: rawMessage });
    if (userRecentChats[userId].length > 15) userRecentChats[userId].shift();

    // NEW: persist recent chat log immediately (cheap, keeps DB in sync even if batch engine hasn't run yet)
    persistUserMemory(userId, userName).catch(() => {});

    // Push into global 5-second buffer queue (now carries reply/mention flags)
    chatBuffer.push({
        chatId,
        msgId,
        userId,
        userName,
        text: rawMessage,
        isReplyToBot,
        mentionsBot,
        time: new Date().toLocaleTimeString('en-IN')
    });
});

// ⏱️ 5-SECOND BATCH PROCESSING ENGINE
setInterval(async () => {
    if (chatBuffer.length === 0) return;

    // Take current batch and empty buffer
    const currentBatch = [...chatBuffer];
    chatBuffer = [];

    // --- NEW: if any message directly targets the bot, force-flag it in the payload ---
    const formattedBatchText = currentBatch.map(m => {
        let tags = '';
        if (m.isReplyToBot) tags += ' [REPLYING_TO_DANISH]';
        if (m.mentionsBot) tags += ' [MENTIONS_DANISH]';
        return `[MsgID: ${m.msgId} | UserID: ${m.userId} | ${m.userName}]${tags}: "${m.text}"`;
    }).join('\n');

    // --- NEW: hard override — if a direct reply/mention exists, don't fully trust the LLM's should_respond ---
    const hasDirectAddress = currentBatch.some(m => m.isReplyToBot || m.mentionsBot);

    // --- NEW: build existing-memory context per user (identified by Telegram userId) so Groq UPDATES instead of overwriting ---
    const uniqueUserIds = [...new Set(currentBatch.map(m => String(m.userId)))];
    const existingMemoryContext = uniqueUserIds.map(uid => {
        const core = userCoreMemory[uid] || "No prior core story recorded.";
        const fresh = userFreshMemory[uid] || "No prior fresh memory.";
        return `[UserID: ${uid}]\n  existing_core_story: "${core}"\n  existing_fresh_memory: "${fresh}"`;
    }).join('\n');

    try {
        const promptPayload =
            `EXISTING MEMORY FOR USERS IN THIS BATCH (matched by Telegram UserID — UPDATE/MERGE this, do NOT discard it):\n${existingMemoryContext}\n\n` +
            `CURRENT CHAT BATCH (Last 5 seconds):\n${formattedBatchText}\n\n` +
            `For each user's "core_story" in your output: start from their existing_core_story above and ADD/REFINE based on the new batch — never throw away previously known facts unless the new message directly contradicts them. "fresh_memory" can fully reflect just this latest batch.`;

        const completion = await groq.chat.completions.create({
            messages: [
                { role: 'system', content: ENGINE_INSTRUCTION },
                { role: 'user', content: promptPayload }
            ],
            model: 'llama-3.1-8b-instant',
            temperature: 0.4,
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
                    await persistUserMemory(update.userId, update.userName || 'User'); // NEW: save to DB
                }
            }
        }

        // 2. CONVERSATIONAL REPLY IF DECIDED BY AI (or forced by direct address)
        const shouldRespond = data.should_respond || hasDirectAddress;

        if (shouldRespond && data.response_text) {
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

async function startBot() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log("✅ MongoDB connected.");
        await loadMemoryFromDB(); // NEW: restore all user data before accepting traffic
    } catch (err) {
        console.error("❌ MongoDB connection/load failed:", err.message);
        process.exit(1);
    }

    await bot.launch();
    console.log("🚀 Autonomous 5s Batch Memory Engine Active...");
    try {
        const me = await bot.telegram.getMe();
        botTelegramId = me.id;
    } catch (e) {
        console.error("❌ Could not fetch bot identity:", e.message);
    }
}

startBot().catch(err => console.error("❌ Launch Failed:", err.message));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));