import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { i18nService, SupportedLanguage } from '../../../../shared/services/i18n-service.js';

interface LanguageRequest {
  Body: {
    language: SupportedLanguage;
  };
}

export class I18nController {
  constructor(private fastify: FastifyInstance) {}

  /**
   * Register i18n routes
   */
  async registerRoutes(): Promise<void> {
    // Get current language
    this.fastify.get('/api/i18n/language', async (request: FastifyRequest, reply: FastifyReply) => {
      return {
        currentLanguage: i18nService.getCurrentLanguage(),
        availableLanguages: i18nService.getAvailableLanguages()
      };
    });

    // Set language
    this.fastify.post('/api/i18n/language', async (request: FastifyRequest<LanguageRequest>, reply: FastifyReply) => {
      const { language } = request.body;

      if (!i18nService.getAvailableLanguages().includes(language)) {
        return reply.code(400).send({
          error: 'Invalid language',
          availableLanguages: i18nService.getAvailableLanguages()
        });
      }

      i18nService.setLanguage(language);

      // Store language preference in session if available
      if (request.session) {
        request.session.language = language;
      }

      return {
        success: true,
        currentLanguage: language
      };
    });

    // Get all messages for current language
    this.fastify.get('/api/i18n/messages', async (request: FastifyRequest, reply: FastifyReply) => {
      return {
        language: i18nService.getCurrentLanguage(),
        messages: i18nService.getAllMessages()
      };
    });

    // Get messages for a specific section
    this.fastify.get('/api/i18n/messages/:section', async (request: FastifyRequest<{ Params: { section: string } }>, reply: FastifyReply) => {
      const { section } = request.params;
      
      try {
        const messages = i18nService.getSection(section as any);
        return {
          language: i18nService.getCurrentLanguage(),
          section,
          messages
        };
      } catch (error) {
        return reply.code(404).send({
          error: 'Section not found',
          section
        });
      }
    });
  }

  /**
   * Middleware to set language from session
   */
  static languageMiddleware() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      // Set language from session if available
      if (request.session?.language) {
        i18nService.setLanguage(request.session.language);
      }
    };
  }
}