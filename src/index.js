/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async email(message, env) {
		try {
			const { from, to } = message;
			const subject = message.headers.get("subject") || "(No Subject)";
			const date = message.headers.get("date") || new Date().toISOString();
			const rawEmail = await new Response(message.raw).text();

			// 🔹 Giải mã nội dung email, đảm bảo UTF-8 đúng
			let { body, encoding, isHtml } = extractEmailContent(rawEmail);

			// 🔹 Nếu Base64 hoặc Quoted-Printable, giải mã trước khi lưu
			if (encoding === "base64") {
				body = decodeBase64(body);
			} else if (encoding === "quoted-printable") {
				body = decodeQuotedPrintable(body);
			}

			// 🔹 Đảm bảo UTF-8 đúng
			body = ensureUTF8(body);

			const emailData = {
				from,
				to,
				subject,
				date,
				receivedAt: new Date().toISOString(),
				content: body || "<p>No content available</p>",
				contentType: "text/html",
			};

			// 🔹 Log chi tiết để kiểm tra
			console.log(emailData);

			// 🔹 Lưu vào KV Store với TTL = 30 phút
			const emailKey = `email:${Date.now()}`;
			await env.LUQA_EMAILS.put(emailKey, JSON.stringify(emailData), { expirationTtl: 1800 });

			// 🔹 Gửi thông báo về Telegram
			await sendToTelegram(emailData, env);

			return new Response("Email stored & sent to Telegram successfully!", { status: 200 });
		} catch (error) {
			console.error("Error processing email:", error);
			return new Response("Error processing email", { status: 500 });
		}
	}
};

// 🔹 Gửi thông báo về Telegram
async function sendToTelegram(emailData, env) {
	try {
		const TELEGRAM_BOT_TOKEN = "5586427649:AAEaFN_sC3IUa4bDzjDuXjJOJT4t6nlQdmA";
		const TELEGRAM_CHAT_ID = "1685057462";

		if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
			console.error("Missing Telegram Bot Token or Chat ID");
			return;
		}

		const message = `📩 *New Email Received!*\n\n
📨 *From:* ${emailData.from}
📩 *To:* ${emailData.to}
📝 *Subject:* ${emailData.subject}
📅 *Date:* ${emailData.date}
📝 *Content Preview:* ${emailData.content.substring(0, 500)}...`;

		const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

		await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				chat_id: TELEGRAM_CHAT_ID,
				text: message,
				parse_mode: "Markdown",
			}),
		});

		console.log("📨 Sent to Telegram:", message);
	} catch (error) {
		console.error("❌ Error sending to Telegram:", error);
	}
}

// 🔹 Trích xuất nội dung email (Chỉ lấy nội dung từ <div> đến </div>)
function extractEmailContent(emailRaw) {
	try {
		let bodyText = "";
		let bodyHtml = "";
		let encoding = null;
		let isHtml = false;

		const parts = emailRaw.split("--");

		for (const part of parts) {
			if (part.includes("Content-Type: text/plain")) {
				encoding = part.includes("Content-Transfer-Encoding: base64") ? "base64" :
					part.includes("Content-Transfer-Encoding: quoted-printable") ? "quoted-printable" : null;
				const match = part.match(/Content-Type: text\/plain; charset="utf-8"\r\n([\s\S]*)/i);
				if (match) bodyText = match[1].trim();
			}

			if (part.includes("Content-Type: text/html")) {
				encoding = part.includes("Content-Transfer-Encoding: base64") ? "base64" :
					part.includes("Content-Transfer-Encoding: quoted-printable") ? "quoted-printable" : null;
				const match = part.match(/Content-Type: text\/html; charset="utf-8"\r\n([\s\S]*)/i);
				if (match) {
					bodyHtml = match[1].trim();
					isHtml = true;
				}
			}
		}

		// 🔹 Xóa dòng "Content-Transfer-Encoding" nếu có
		bodyHtml = bodyHtml.replace(/^Content-Transfer-Encoding:.*?\r\n\r\n/, "").trim();

		// 🔹 Lấy nội dung từ <div> đến </div> cuối cùng
		const divMatch = bodyHtml.match(/<div[\s\S]*<\/div>/i);
		if (divMatch) {
			bodyHtml = divMatch[0]; // Giữ lại phần từ <div> đến </div>
		}

		return { body: bodyHtml || `<p>${bodyText.replace(/\n/g, "<br>")}</p>`, encoding, isHtml: true };
	} catch (error) {
		console.error("Error extracting email content:", error);
		return { body: "<p>Error extracting content</p>", encoding: null, isHtml: true };
	}
}

// 🔹 Giải mã `quoted-printable`
function decodeQuotedPrintable(input) {
	return input
		.replace(/=\r\n/g, "") // Xóa dòng xuống
		.replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// 🔹 Giải mã `base64`
function decodeBase64(input) {
	try {
		// Xoá dấu xuống dòng
		const cleanedInput = input.replace(/[\r\n]/g, "").trim();

		// Giải mã Base64
		const byteArray = Uint8Array.from(atob(cleanedInput), c => c.charCodeAt(0));
		return new TextDecoder("utf-8").decode(byteArray);
	} catch (error) {
		console.error("Error decoding base64:", error, "Base64 Content:", input);
		return "<p>Error decoding base64 content</p>";
	}
}

// 🔹 Đảm bảo chuỗi UTF-8 không bị mã hóa lỗi
function ensureUTF8(str) {
	try {
		return decodeURIComponent(escape(str));
	} catch (e) {
		return str; // Nếu không thể chuyển đổi, giữ nguyên
	}
}


