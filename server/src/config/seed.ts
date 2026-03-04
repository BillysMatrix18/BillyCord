import bcrypt from 'bcryptjs';
import { query } from './database';

async function seed() {
  try {
    console.log('Seeding database...');

    // Create demo users
    const password = await bcrypt.hash('password123', 12);

    const user1 = await query(
      `INSERT INTO users (username, email, password_hash, email_verified, status)
       VALUES ($1, $2, $3, 1,'online')
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      ['DemoUser', 'demo@example.com', password]
    );

    const user2 = await query(
      `INSERT INTO users (username, email, password_hash, email_verified, status)
       VALUES ($1, $2, $3, 1,'online')
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      ['TestUser', 'test@example.com', password]
    );

    if (!user1.rows[0] || !user2.rows[0]) {
      console.log('Seed data already exists, skipping...');
      process.exit(0);
      return;
    }

    const userId1 = user1.rows[0].id;
    const userId2 = user2.rows[0].id;

    // Create a demo server
    const server = await query(
      `INSERT INTO servers (name, owner_id, description)
       VALUES ($1, $2, $3) RETURNING id`,
      ['Welcome Server', userId1, 'A friendly place to chat!']
    );
    const serverId = server.rows[0].id;

    // Add both users as members
    await query(
      `INSERT INTO server_members (user_id, server_id) VALUES ($1, $2)`,
      [userId1, serverId]
    );
    await query(
      `INSERT INTO server_members (user_id, server_id) VALUES ($1, $2)`,
      [userId2, serverId]
    );

    // Create default role
    await query(
      `INSERT INTO roles (server_id, name, color, position, permissions)
       VALUES ($1, '@everyone', '#99AAB5', 0, $2)`,
      [serverId, (1 << 0) | (1 << 1) | (1 << 3) | (1 << 4) | (1 << 5) | (1 << 6) | (1 << 14)]
    );

    // Create a category
    const category = await query(
      `INSERT INTO categories (server_id, name, position)
       VALUES ($1, 'Text Channels', 0) RETURNING id`,
      [serverId]
    );
    const categoryId = category.rows[0].id;

    // Create channels
    const generalChannel = await query(
      `INSERT INTO channels (server_id, name, type, position, category_id, topic)
       VALUES ($1, 'general', 'text', 0, $2, 'General discussion') RETURNING id`,
      [serverId, categoryId]
    );

    await query(
      `INSERT INTO channels (server_id, name, type, position, category_id)
       VALUES ($1, 'random', 'text', 1, $2)`,
      [serverId, categoryId]
    );

    await query(
      `INSERT INTO channels (server_id, name, type, position)
       VALUES ($1, 'General', 'voice', 2)`,
      [serverId]
    );

    // Create some messages
    const channelId = generalChannel.rows[0].id;
    await query(
      `INSERT INTO messages (channel_id, sender_id, content)
       VALUES ($1, $2, $3)`,
      [channelId, userId1, 'Welcome to the server! 🎉']
    );
    await query(
      `INSERT INTO messages (channel_id, sender_id, content)
       VALUES ($1, $2, $3)`,
      [channelId, userId2, 'Hey everyone! Glad to be here.']
    );

    // Create friendship
    await query(
      `INSERT INTO friends (requester_id, receiver_id, status)
       VALUES ($1, $2, 'accepted')`,
      [userId1, userId2]
    );

    // Create an invite
    await query(
      `INSERT INTO invites (server_id, creator_id, code) VALUES ($1, $2, $3)`,
      [serverId, userId1, 'welcome01']
    );

    console.log('Seed completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }
}

seed();
