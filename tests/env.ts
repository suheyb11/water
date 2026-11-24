// Point the app's Prisma client at the test database before anything imports it.
import "dotenv/config";
const url = process.env.TEST_DATABASE_URL;
if (!url || !/database=WaterPortal_Test;/i.test(url)) throw new Error("TEST_DATABASE_URL must point at WaterPortal_Test");
process.env.DATABASE_URL = url;
process.env.BUSINESS_TIMEZONE ||= "Africa/Mogadishu";
