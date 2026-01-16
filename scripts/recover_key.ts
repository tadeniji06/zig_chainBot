import { Database } from "better-sqlite3";
import DatabaseConstructor from "better-sqlite3";
import path from "path";
import dotenv from "dotenv";
import { decrypt } from "../src/utils/encryption.js";

dotenv.config();

const TARGET_ADDRESS = "zig1pjzecuxkz0a8uj9v2qmgjtqstl4gmz0f7scyg8";
const DB_PATH = path.join(process.cwd(), "data", "bot.db");

async function recover() {
	console.log(`Searching for wallet: ${TARGET_ADDRESS}`);
	console.log(`Database path: ${DB_PATH}`);

	try {
		const db = new DatabaseConstructor(DB_PATH);

		const row = db
			.prepare("SELECT * FROM wallets WHERE address = ?")
			.get(TARGET_ADDRESS) as any;

		if (!row) {
			console.error("❌ Wallet NOT found in this database.");
			console.log(
				"If this wallet was created on the Railway deployment, you must download the database from the Railway volume first."
			);
			return;
		}

		console.log("✅ Wallet found!");
		console.log(`User ID: ${row.telegram_id}`);
		console.log(`Name: ${row.name}`);

		if (!process.env.ENCRYPTION_KEY) {
			console.error("❌ ENCRYPTION_KEY not found in .env file.");
			return;
		}

		try {
			const secret = decrypt(row.encrypted_private_key);
			console.log("\n🔑 RECOVERED SECRET (Mnemonic or Key):");
			console.log(
				"---------------------------------------------------"
			);
			console.log(secret);
			console.log(
				"---------------------------------------------------"
			);
		} catch (err) {
			console.error(
				"❌ Failed to decrypt. Ensure ENCRYPTION_KEY matches the one used to create the wallet."
			);
			console.error(err);
		}
	} catch (error) {
		console.error("Database error:", error);
	}
}

recover();
