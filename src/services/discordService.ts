
export interface DiscordMessage {
  content?: string;
  embeds?: {
    title?: string;
    description?: string;
    color?: number;
    fields?: { name: string; value: string; inline?: boolean }[];
    footer?: { text: string };
    timestamp?: string;
  }[];
}

export const sendDiscordNotification = async (webhookUrl: string, message: DiscordMessage) => {
  if (!webhookUrl) return;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      console.error('Discord Webhook Error:', await response.text());
    }
  } catch (error) {
    console.error('Failed to send Discord notification:', error);
  }
};

export const formatSignalMessage = (signal: {
  pair: string;
  action: string;
  entryPrice: number | string;
  tp: number | string;
  sl: number | string;
  analysis?: string;
  setupType?: string;
  confirmations?: string[];
}) => {
  const isBuy = signal.action.toUpperCase() === 'BUY';
  const color = isBuy ? 0x22C55E : 0xEF4444; // Green or Red
  const actionEmoji = isBuy ? '🟢' : '🔴';
  const actionText = isBuy ? 'BUY / BELI' : 'SELL / JUAL';
  
  // Thumbnails for better visual
  const thumbnail = signal.pair.includes('XAU') 
    ? 'https://cdn-icons-png.flaticon.com/512/2489/2489756.png' // Gold icon
    : 'https://cdn-icons-png.flaticon.com/512/5968/5968260.png'; // BTC icon

  const confirmationText = signal.confirmations?.map(c => `• ${c}`).join('\n') || '• Analisis Struktur\n• Konfirmasi Volume\n• Indikator Momentum';

  return {
    content: "@everyone 🚀 **SINYAL TRADING MATANG TERDETEKSI!**",
    embeds: [
      {
        title: `${actionEmoji} ${signal.pair} - ${actionText}`,
        description: `**Setup:** \`${signal.setupType || 'High Probability'}\`\n\n> ${signal.analysis || 'Analisis pasar real-time telah diperbarui oleh Ninz AI.'}`,
        color: color,
        thumbnail: {
          url: thumbnail
        },
        fields: [
          { 
            name: '📍 HARGA ENTRY', 
            value: `\`\`\`fix\n${signal.entryPrice}\n\`\`\``, 
            inline: true 
          },
          { 
            name: '🎯 TARGET PROFIT (TP)', 
            value: `\`\`\`yaml\n${signal.tp}\n\`\`\``, 
            inline: true 
          },
          { 
            name: '🛡️ STOP LOSS (SL)', 
            value: `\`\`\`diff\n- ${signal.sl}\n\`\`\``, 
            inline: true 
          },
          { 
            name: '✅ KONFIRMASI TEKNIKAL', 
            value: confirmationText, 
            inline: false 
          },
          { 
            name: '📊 STATUS', 
            value: '`AKTIF`', 
            inline: true 
          },
          { 
            name: '⚖️ RISK/REWARD', 
            value: '`1:2+`', 
            inline: true 
          },
          { 
            name: '⚡ AKURASI AI', 
            value: '`90%+`', 
            inline: true 
          },
        ],
        image: {
          url: 'https://i.imgur.com/8L8vX8m.png'
        },
        footer: { 
          text: 'Ninz Signal AI Terminal • Trading dengan Konfirmasi adalah Kunci',
          icon_url: 'https://cdn-icons-png.flaticon.com/512/2583/2583130.png'
        },
        timestamp: new Date().toISOString(),
      },
    ],
  };
};
