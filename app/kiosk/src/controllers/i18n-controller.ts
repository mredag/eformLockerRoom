import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { i18nService, SupportedLanguage } from '../../../../shared/services/i18n-service';

interface LanguageRequest {
  Body: {
    language: SupportedLanguage;
  };
}

export class KioskI18nController {
  constructor(private fastify: FastifyInstance) {}

  /**
   * Register kiosk i18n routes
   */
  async registerRoutes(): Promise<void> {
    // Get current language and kiosk messages
    this.fastify.get('/api/i18n/kiosk', async (request: FastifyRequest, reply: FastifyReply) => {
      return {
        currentLanguage: i18nService.getCurrentLanguage(),
        availableLanguages: i18nService.getAvailableLanguages(),
        messages: {
          kiosk: i18nService.getSection('kiosk'),
          qr: i18nService.getSection('qr')
        }
      };
    });

    // Set language for kiosk
    this.fastify.post('/api/i18n/kiosk/language', async (request: FastifyRequest<LanguageRequest>, reply: FastifyReply) => {
      const { language } = request.body;

      if (!i18nService.getAvailableLanguages().includes(language)) {
        return reply.code(400).send({
          error: 'Invalid language',
          availableLanguages: i18nService.getAvailableLanguages()
        });
      }

      i18nService.setLanguage(language);

      return {
        success: true,
        currentLanguage: language,
        messages: {
          kiosk: i18nService.getSection('kiosk'),
          qr: i18nService.getSection('qr')
        }
      };
    });

    // Get specific message with parameters
    this.fastify.post('/api/i18n/message', async (request: FastifyRequest<{ Body: { key: string; params?: Record<string, any> } }>, reply: FastifyReply) => {
      const { key, params = {} } = request.body;
      
      return {
        message: i18nService.get(key, params),
        language: i18nService.getCurrentLanguage()
      };
    });
  }

  /**
   * Get localized message for server-side use
   */
  static getMessage(key: string, params: Record<string, any> = {}): string {
    return i18nService.get(key, params);
  }

  /**
   * Set language for server-side operations
   */
  static setLanguage(language: SupportedLanguage): void {
    i18nService.setLanguage(language);
  }
}
