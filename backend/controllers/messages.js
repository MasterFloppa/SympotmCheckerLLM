// import OpenAI from 'openai';
import { pool } from '../db.js';
import axios from 'axios';
import crypto from 'crypto';

//NEW
import dotenv from 'dotenv';
dotenv.config();
import { COTSYSTEM, INITIALSYSTEM, INITIALSYSTEM2, INITIALSYSTEM3, minimalSystemPrompt } from './system_prompts.js';

const algorithm = 'aes-256-cbc';
const secretKey = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

const encrypt = (text) => {
	const iv = crypto.randomBytes(16); // Initialization vector
	const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
	let encrypted = cipher.update(text);
	encrypted = Buffer.concat([encrypted, cipher.final()]);
	return iv.toString('hex') + ':' + encrypted.toString('hex');
};

const decrypt = (text) => {
	const textParts = text.split(':');
	const iv = Buffer.from(textParts.shift(), 'hex');
	const encryptedText = Buffer.from(textParts.join(':'), 'hex');
	const decipher = crypto.createDecipheriv(
		algorithm,
		Buffer.from(secretKey),
		iv
	);
	let decrypted = decipher.update(encryptedText);
	decrypted = Buffer.concat([decrypted, decipher.final()]);
	return decrypted.toString();
};

//NEW
// Ollama Chat Function
const ollamaChat = async ({ messages }) => {
	try {
		//console.log({ messages});
		const response = await axios.post(`${process.env.OLLAMA_HOST}/api/chat`, {
			model: process.env.OLLAMA_MODEL,
			messages: messages,
			// prompt: prompt,
			// format: "json",
			stream: false,
			options: {
				temperature: 0.3,  // Lower for more structured responses
				num_ctx: 4096  // Gives model more context for formatting
			},
			//template: `{{ .Prompt }}\n\nALWAYS RESPOND IN THIS FORMAT:\n${INITIALSYSTEM2}`
		}, {
			headers: {
				'Content-Type': 'application/json',
			}
		});
		//console.log({ response, data: response.data })
		return response.data;
	} catch (error) {
		console.error('Error calling Ollama:', error);
		throw new Error('LLM processing failed');
	}
};


const handleDiagnosis = async (data) => {
	console.log("-------------------------------------------------------------------------------");
	try {
		const content = JSON.parse(data.content);
		return content.diagnosis || [];
	} catch (error) {
		console.error('Error processing diagnosis:', error);
		return [];
	}
};


export const createMessage = async (req, res) => {
	try {
		const { chats, chatID, userInfo } = req.body;

		/*
		User name: ${userInfo.name}
		User age: ${userInfo.age}
		User gender: ${userInfo.gender}
		*/

		const message = [
			{
				role: "system",
				content: INITIALSYSTEM3,
			},
			{
				role: "assistant",
				content: "Hello User! Please describe what happend to you."
			}
		];

		const allPreviousMessages = [...message, ...chats.slice(0, -1)];
		const userPrompt = chats[chats.length - 1].content;
		const allMessagesWithPrompt = [
			...allPreviousMessages,
			{
				role: "user",
				content: userPrompt
			}
		];

		console.log("Sent to Ollama.");
		const result = await ollamaChat({
			messages: allMessagesWithPrompt,
		});

		// console.log('####################');
		// console.log('Ollama Result:', result);
		// console.log('####################');
		// console.log({ result })

		const rawResponse = result.message.content;	//?.trim();
		//console.log('Raw Response:', rawResponse);

		//------------------------------------------------------------------------
		//NEW
		let parsedContent;
		try {
			// Clean the response and parse JSON
			const cleanedResponse = rawResponse
				.replace(/```json/g, '')
				.replace(/```/g, '')
				.trim();

			//console.log('Cleaned Response:', cleanedResponse);
			const responseJson = JSON.parse(cleanedResponse);

			// Handle the nested analysis structure
			parsedContent = {
				message: responseJson.analysis?.description || "Please provide more details about your symptoms",
				diagnosis: (responseJson.analysis?.findings || []).map(finding => ({
					disease_name: finding.condition || "Unknown condition",
					course_of_action: finding.recommendation || "Consult a healthcare professional"
				}))
			};
		} catch (error) {
			console.error('Error parsing response:', error);
			parsedContent = {
				message: "I need more information to help you. Could you please describe your symptoms?",
				diagnosis: []
			};
		}

		const response = {
			role: "assistant",
			content: JSON.stringify(parsedContent)
		};

		console.log("----------------------------------------------------------------");
		console.log('Response:', response);
		console.log("----------------------------------------------------------------");

		const updateQuery = `
		    UPDATE chats SET chat_name = $1, diagnosis = $2
		    WHERE chat_id = $3
		`;
		const insertQuery = `
		    INSERT INTO messages (message_type, content, chat_id)
		    VALUES ($1, $2, $3)
		`;
		const diagnosis = await handleDiagnosis(response);
		console.log('Diagnosis:', diagnosis);

		try {
			const encryptedUserMessage = encrypt(chats[chats.length - 1].content);
			const encryptedResponseMessage = encrypt(response.content);
			await pool.query(insertQuery, [
				chats[chats.length - 1].role,
				encryptedUserMessage,
				chatID,
			]);
			await pool.query(insertQuery, [
				response.role,
				encryptedResponseMessage,
				chatID,
			]);
		} catch (error) {
			console.log('Encryption Key Length:', secretKey.length);
			console.error('Error inserting into messages table:', error);
		}

		if (diagnosis.length) {
			//console.log('hello', diagnosis);
			try {
				await pool.query(updateQuery, [
					diagnosis[0].disease_name,
					JSON.stringify(diagnosis),
					chatID,
				]);
				res.status(201)
					.json({ response, diagnosis: JSON.stringify(diagnosis) });
			} catch (error) {
				console.error('An error occured', error);
			}
		} else {
			res.status(201).json({ response });
		}
	} catch (error) {
		res.status(500).json({ success: false, message: error.message });
	}
};

export const getMessages = async (req, res) => {
	try {
		console.log('getMessages', req.params.chat_id);
		const chat_id = parseInt(req.params.chat_id);
		const selectQuery = `
            SELECT * FROM messages WHERE chat_id = $1
        `;
		let response = {};
		try {
			response = await pool.query(selectQuery, [chat_id]);
			response.rows.forEach((row) => {
				row.content = decrypt(row.content);
				// console.log('Decrypted Message:', content);
			});
			console.log({ rows: response.rows })
			res.status(200).json({ response: response.rows });
		} catch (error) {
			console.error('Error fetching chats:', error);
			res.status(500).json({ success: false, message: error.message });
		}
	} catch (error) {
		console.error('Error fetching chats:', error);
		res.status(500).json({ success: false, message: error.message });
	}
};
