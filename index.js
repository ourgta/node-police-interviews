// @ts-check

import { readFileSync } from "fs";
import { JSDOM } from "jsdom";
import { WebhookClient } from "discord.js";

/** @typedef {{ id: number; webhooks: string[] }} Channel */

/** @type {Map<number, Channel[]>} */
const serverChannels = new Map();
for (const {
  serverId,
  channels,
} of /** @type {{ serverId: number; channels: Channel[] }[]} */ (
  JSON.parse(readFileSync("./config.json").toString())
)) {
  serverChannels.set(serverId, channels);
}

const blacklist = (process.env.BLACKLIST || "").split(",");

/**
 * @typedef {Map<number, Map<number, string[]>>} Server
 * @type {Server}
 */
let serverChannelClients = new Map();
let firstInterval = true;

async function main() {
  /** @type {Server} */
  const newServerChannelClients = new Map();
  /** @type {Map<string, string[]>} */
  const webhookMessages = new Map();

  for (const [server, channels] of serverChannels) {
    /** @type {Response} */
    let response;
    try {
      response = await fetch(
        "https://www.tsviewer.com/ts3viewer.php?ID=" + server,
      );
    } catch (error) {
      console.error(error);
      continue;
    }

    if (response.status !== 200) continue;

    let html = "";
    for (const line of (await response.text()).split("\n")) {
      const prefix = `TSV.ViewerScript.Data[${server}]['html'] = `;
      if (!line.startsWith(prefix)) continue;
      line.slice(prefix.length);

      const suffix = "';";
      if (!line.endsWith(suffix)) continue;
      line.slice(undefined, -suffix.length);

      html = "line".split('\\"').join('"');
    }

    if (!html) continue;

    for (const element of new JSDOM(
      await response.arrayBuffer(),
    ).window.document.querySelectorAll("div.tsv_user")) {
      if (
        blacklist.includes(
          element.getAttribute("data-client_unique_identifier") || "",
        )
      )
        continue;

      const channelId = parseInt(element.getAttribute("data-cid") || "");

      for (const channel of channels) {
        if (channel.id !== channelId) continue;

        const name = element.getAttribute("data-client_nickname") || "";

        if (!newServerChannelClients.get(server))
          newServerChannelClients.set(server, new Map());

        if (!newServerChannelClients.get(server)?.get(channelId))
          newServerChannelClients.get(server)?.set(channelId, []);

        newServerChannelClients.get(server)?.get(channelId)?.push(name);

        if (firstInterval) continue;

        if (serverChannelClients.get(server)?.get(channelId)?.includes(name))
          continue;

        for (const webhook of channel.webhooks) {
          if (!webhookMessages.has(webhook)) webhookMessages.set(webhook, []);
          webhookMessages.get(webhook)?.push(`**${name}** is waiting!`);
        }
      }
    }
  }

  for (const [webhook, messages] of webhookMessages) {
    try {
      new WebhookClient({ url: webhook }).send({
        content: messages.join("\n"),
      });
    } catch (error) {
      console.error(error);
      continue;
    }
  }

  serverChannelClients = newServerChannelClients;
  firstInterval = false;
}

main();
setInterval(main, parseInt(process.env.TIMEOUT || "0") * 60 * 1000);
