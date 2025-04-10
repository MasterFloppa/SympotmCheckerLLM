import { pool } from '../db.js';

export const getChats = async (req, res) => {
	try {
		const sender_email = req.params.sender_email;

		const selectQuery = `
            SELECT * FROM chats
            WHERE sender_email = $1
        `;
		let response = {};
		try {
			response = await pool.query(selectQuery, [sender_email]);
			res.status(200).json({ response: response.rows });
		} catch (error) {
			console.error('Error fetching chats:', error);
			res.status(500).json({ success: false, message: error.message });
		}
	} catch (error) {
		res.status(500).json({ success: false, message: error.message });
	}
};

export const createChat = async (req, res) => {
	try {
		const { sender_email, system } = req.body;

		const selectQuery = `
            INSERT INTO chats (sender_email, diagnosis) 
            VALUES ($1, $2)
            RETURNING chat_id;
        `;
		let response = {};
		try {
			response = await pool.query(selectQuery, [sender_email, "No Diagnosis"]);
			res.status(201).json({ response: response.rows });
		} catch (error) {
			console.error('Error fetching chats:', error);
			res.status(500).json({ success: false, message: error.message });
		}
	} catch (error) {
		res.status(500).json({ success: false, message: error.message });
	}
};

export const deleteChat = async (req, res) => {
	try {
		const chat_id = req.params.chat_id;
		const deleteQuery1 = `
			DELETE FROM messages WHERE chat_id = $1;
		`;
		const deleteQuery2 = `
			DELETE FROM chats WHERE chat_id = $1;
		`;
		let response = {};
		try {
			response = await pool.query(deleteQuery1, [chat_id]);
			response = await pool.query(deleteQuery2, [chat_id]);
			res.status(201).json({ response: response.rows });
		} catch (error) {
			console.error('Error fetching chats:', error);
			res.status(500).json({ success: false, message: error.message });
		}
	} catch (error) {
		res.status(500).json({ success: false, message: error.message });
	}
}
