import dotenv from "dotenv";
import express from "express";
import multer from "multer";
import { Readable } from 'stream';
import { google } from "googleapis";

dotenv.config();

const PORT = process.env.PORT || 3000;
const FOLDER_ID = process.env.FOLDER_ID!;
const SERVICE_ACCOUNT_EMAIL = process.env.SERVICE_ACCOUNT_EMAIL!;
const SERVICE_ACCOUNT_KEY = process.env.SERVICE_ACCOUNT_KEY!;

const app = express();

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.post("/upload", upload.single("file"), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).send({ error: "No file received" });
  }

  const fileStream = file.buffer;

  try {
    const auth = new google.auth.JWT(
      SERVICE_ACCOUNT_EMAIL,
      undefined,
      SERVICE_ACCOUNT_KEY.replace(/\\n/g, "\n"),
      ["https://www.googleapis.com/auth/drive"]
    );

    await auth.authorize();
    const drive = google.drive({ version: "v3", auth });
    const created = await drive.files.create({
      requestBody: {
        name: file.originalname,
        parents: [FOLDER_ID],
      },
      media: {
        mimeType: file.mimetype,
        body: Readable.from(fileStream)
      },
    });
    res.send({ uploadedFileId: created.data.id });
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: "File upload failed" });
  }
});

app.get('/download/:fileId', async (req, res) => {
    const { fileId } = req.params;

    if (!fileId) {
        return res.status(400).send({ error: 'File ID is required' });
    }

    try {
        const auth = new google.auth.JWT(
            SERVICE_ACCOUNT_EMAIL,
            undefined,
            SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n'),
            ['https://www.googleapis.com/auth/drive.readonly']
        );

        await auth.authorize();

        const drive = google.drive({ version: 'v3', auth });

        const metadata = await drive.files.get({
            fileId: fileId,
            fields: 'mimeType,name',
        });

        const mimeType = metadata.data.mimeType;
        const fileName = metadata.data.name;

        if (!mimeType || !fileName) {
            throw new Error('MIME type or filename missing from the file metadata.');
        }

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

        const driveResponse = await drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        driveResponse.data.on('error', err => {
            console.error('Error streaming the file', err);
            res.status(500).send({ error: 'File streaming failed' });
        }).pipe(res);

    } catch (error) {
        console.error('Error fetching file:', error);
        res.status(500).send({ error: 'File download failed' });
    }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
