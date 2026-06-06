import 'dotenv/config';
import { createApp } from './app';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const app  = createApp();

app.listen(PORT, () => {
  console.log(`JRC Offer Management server running on port ${PORT} [${process.env.NODE_ENV ?? 'development'}]`);
});
