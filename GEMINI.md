# Gemini Assistant Guide for eForm Locker System

This document provides essential guidelines for the Gemini AI assistant to effectively and safely interact with the `eformLockroom` repository.

## 1. Core Project Structure

- **`app/`**: Contains the main application services:
  - `gateway`: Main API coordinator.
  - `kiosk`: Hardware control service (Modbus RTU, RFID).
  - `panel`: Admin web interface.
  - `agent`: Background task processing.
- **`shared/`**: Shared TypeScript libraries for database, services, etc.
- **`scripts/`**: Deployment, maintenance, and testing scripts.
- **`config/`**: System and environment configuration files (`.json`).
- **`migrations/`**: SQL database schema migration files.
- **`docs/`**: Project documentation.

## 2. Essential Commands

- **Installation**: `npm run install-all`
- **Build All**: `npm run build`
- **Run Services (Dev)**: `npm run dev:<gateway|kiosk|panel|agent>`
- **Run Tests**: `npm test`
- **End-to-End Tests (Windows)**: `npm run test:e2e:full:windows`
- **Database Migrations**: `npm run migrate`
- **Hardware Test**: `node scripts/test-basic-relay-control.js`
- **Restart All Services**: `./scripts/start-all-clean.sh` (on Pi)

## 3. Development Workflow & Conventions

- **Language**: TypeScript (Node 20+), 2-space indentation.
- **File Naming**: `kebab-case`.
- **Commits**: Use **Conventional Commits**.
  - `feat(scope): description`
  - `fix(scope): description`
  - **Example**: `feat(kiosk): add support for new RFID reader`
- **Pull Requests**: Before submitting, ensure `npm run build` and `npm test` pass. Link to issues and provide clear descriptions.
- **Logic**: Business logic should be in `shared/services` and database repositories, not directly in routes/controllers.

## 4. Safety, Configuration, and Database

- **DO NOT COMMIT SECRETS**: Manage environment-specific settings in `config/*.json`. Use `npm run config:validate` to check configurations.
- **Database Changes**: All schema modifications must be done via `migrations/*.sql` files. Run `npm run migrate` to apply them.
- **Hardware Access**: On Linux/Pi, the serial port `/dev/ttyUSB0` may require permissions (`chmod 666`).

## 5. Hardware & Production Environment

- **Platform**: Raspberry Pi 5 with a USB-RS485 adapter.
- **Protocol**: Modbus RTU for relay control.
- **Production Pi**: `192.168.1.8` (SSH: `ssh pi@pi-eform-locker`).
- **Service Endpoints**:
  - Gateway: `http://192.168.1.10:3000`
  - Panel: `http://192.168.1.10:3001`
  - Kiosk: `http://192.168.1.10:3002`

When asked to perform tasks, refer to these guidelines to ensure consistency and safety.
