// Point the app's Prisma client at the test database before anything imports it.
import "dotenv/config";
import { isTestDbUrl } from "./test-db";
const url = process.env.TEST_DATABASE_URL;
if (!isTestDbUrl(url)) throw new Error("TEST_DATABASE_URL must point at a database named waterportal_test or use ?schema=test");
process.env.DATABASE_URL = url;
process.env.BUSINESS_TIMEZONE ||= "Africa/Mogadishu";
