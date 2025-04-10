// import OpenAI from 'openai';
import { pool } from '../db.js';
import axios from 'axios';
import crypto from 'crypto';

//NEW
import dotenv from 'dotenv';
dotenv.config();
import { INITIALSYSTEM, INITIALSYSTEM2, minimalSystemPrompt } from './system_prompts.js';

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
const ollamaChat = async ({ messages, prompt }) => {
	try {
		console.log({ messages, prompt });
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
		const { chats, chatID, userInfo } = req.body;		//SYSTEM ?????????????

		let COTSYSTEM = `
		You are a medical symptom checker assistant designed to help users understand potential causes of their symptoms. 
		Utilize the below information as you interface with the user
		User name: ${userInfo.name}
		User age: ${userInfo.age}
		User gender: ${userInfo.gender}

		Your role is to ask questions, gather symptoms, and suggest possible diagnoses based on the information provided.

		Always follow these steps in your conversation with the user:

		1. Greet the user using their name and ask them to describe their symptoms in their own words.
		2. Ask clarifying questions such as: when did the symptoms start, how severe they are, and if anything makes them better or worse.
		3. Once enough information is collected, analyze the symptoms and provide a list of possible conditions and recommended courses of action.

		⚠️ You are NOT a doctor, and your suggestions should not be considered a final diagnosis. However, you **must** still generate possible conditions based on symptoms, as this helps the user seek the right kind of help.

		💡 Format:
		All responses must be valid JSON. No extra commentary. No markdown code blocks. The JSON must contain:

		- "message": a short summary or explanation
		- "diagnosis": an array of objects. Each object must include:
		- "disease_name": name of the condition
		- "course_of_action": suggested next steps (e.g., visit doctor, rest, drink water)

		🛑 If the user says something vague or you truly can't suggest any conditions, still return an empty "diagnosis" array, but only as a last resort.

		✅ Example output:
		{
			"message": "Based on the symptoms you've shared, here are some possibilities.",
			"diagnosis": [
				{
				"disease_name": "Common Cold",
				"course_of_action": "Stay hydrated and rest. See a doctor if symptoms persist."
				},
				{
				"disease_name": "Allergic Rhinitis",
				"course_of_action": "Avoid allergens, and consider taking antihistamines."
				}
			]
		}

		🔄 **Critical Response Formatting:**
		You MUST format your response as VALID JSON using this EXACT structure:
		\`\`\`json
		{
		"message": "your summary message here",
		"diagnosis": [
			{
			"disease_name": "Condition name",
			"course_of_action": "Recommended steps"
			}
		]
		}
		\`\`\`

		🔧 Formatting Rules:
		1. Wrap your response in \`\`\`json code blocks
		2. Always include BOTH "message" and "diagnosis" fields
		3. Keep the diagnosis array empty only if absolutely no conditions match
		4. Use double quotes for all JSON properties
		`;

		const message = [
			{
				role: "system",
				content: INITIALSYSTEM,
			},
			{
				role: "assistant",
				content: "Hello User! Please describe what happend to you."
			}
		];

		//NEW
		const allPreviousMessages = [...message, ...chats.slice(0, -1)];
		const userPrompt = chats[chats.length - 1].content;
		//console.log({ allPreviousMessages, userPrompt });
		const result = await ollamaChat({
			messages: allPreviousMessages,
			prompt: userPrompt
		});
		console.log('####################');
		console.log('Ollama Result:', result);
		console.log('####################');
		console.log({ result })
		const rawResponse2 = result.response;	//?.trim();
		const rawResponse = result.content;	//?.trim();
		//console.log('Raw Response:', rawResponse);

		//------------------------------------------------------------------------
		//NEW
		let parsedContent;
		try {
			// Parse the raw response
			const responseJson = JSON.parse(rawResponse.replace(/```json/g, '').replace(/```/g, ''));
			parsedContent = {
				message: responseJson.analysis?.description || "Please provide more details about your symptoms",
				diagnosis: responseJson.analysis?.findings?.map(f => ({
					disease_name: f.condition,
					course_of_action: f.recommendation
				})) || []
			};
		} catch (error) {
			console.error('Error parsing response:', error);
			parsedContent = {
				message: "I need more information to help you. Could you please describe your symptoms?",
				diagnosis: ["No diagnosis available"]
			};
		}

		const response = {
			role: "assistant",
			content: JSON.stringify(parsedContent)
		};

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
