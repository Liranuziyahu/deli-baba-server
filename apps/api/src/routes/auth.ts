// apps/api/src/routes/auth.ts
import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { z } from "zod";

export default async function authRoutes(app: FastifyInstance) {
  const prisma = app.prisma;

  // 🧩 סכימות ולידציה עם Zod
  const registerB = z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    name: z.string().min(2, "Name is required"),
  });

  const loginB = z.object({
    email: z.string().email("Invalid email format"),
    password: z.string().min(1, "Password is required"),
  });

  // 🧠 Register
  app.post("/auth/register", async (req, reply) => {
    try {
      const { email, password, name } = registerB.parse(req.body);

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) return reply.status(400).send({ error: "Email already exists" });

      const hash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { email, passwordHash: hash, fullName: name },
      });

      reply.send({ id: user.id, email: user.email, name: user.fullName });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: "ValidationError", issues: err.errors });
      }
      app.log.error({ err }, "POST /auth/register failed");
      return reply.status(500).send({ error: "RegisterFailed" });
    }
  });

  // 🔐 Login
  app.post("/auth/login", async (req, reply) => {
    try {
      const { email, password } = loginB.parse(req.body);

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        return reply.status(401).send({ error: "Invalid credentials" });
      }

      const token = app.jwt.sign({ id: user.id, email: user.email });
      reply.send({ token });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return reply.status(400).send({ error: "ValidationError", issues: err.errors });
      }
      app.log.error({ err }, "POST /auth/login failed");
      return reply.status(500).send({ error: "LoginFailed" });
    }
  });

  // 👤 Authenticated user info
  app.get("/auth/me", { preHandler: [app.authenticate] }, async (req) => {
    return req.user;
  });
}
