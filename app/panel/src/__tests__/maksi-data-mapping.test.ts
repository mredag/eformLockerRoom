/**
 * Unit Tests for Maksisoft Data Mapping Function
 * 
 * Tests the mapMaksi function with sample MaksiHit responses to ensure
 * proper data transformation and field mapping.
 * 
 * Requirements: Core functionality validation
 */

import { describe, it, expect } from 'vitest';
import { mapMaksi, type MaksiHit } from '../services/maksi-types';

describe('Maksisoft Data Mapping', () => {
  describe('mapMaksi function', () => {
    it('should map complete MaksiHit to MaksiUser with all fields', () => {
      const sampleHit: MaksiHit = {
        id: 1026,
        name: 'Ahmet Yılmaz',
        phone: '0532123456',
        type: 1,
        sex: 'Bay',
        gsm: '0506789012',
        photo: 'profile_1026.jpg',
        checkListDate: '2019-04-20 16:38',
        checkListStatus: 'out',
        endDate: '2019-11-05',
        proximity: '0006851540',
        tc: '1234567****'
      };

      const result = mapMaksi(sampleHit);

      expect(result).toEqual({
        id: 1026,
        fullName: 'Ahmet Yılmaz',
        phone: '0532123456',
        rfid: '0006851540',
        gender: 'Bay',
        membershipType: 1,
        membershipEndsAt: '2019-11-05',
        lastCheckAt: '2019-04-20 16:38',
        lastCheckStatus: 'out',
        tcMasked: '1234567****',
        photoFile: 'profile_1026.jpg'
      });
    });

    it('should handle empty/null name field', () => {
      const sampleHit: MaksiHit = {
        id: 1027,
        name: '',
        phone: '0532123456',
        type: 1,
        sex: 'Bayan',
        gsm: '',
        photo: '',
        checkListDate: '',
        checkListStatus: '',
        endDate: '',
        proximity: '0006851541',
        tc: ''
      };

      const result = mapMaksi(sampleHit);

      expect(result.fullName).toBeNull();
      expect(result.phone).toBe('0532123456');
      expect(result.rfid).toBe('0006851541');
    });

    it('should prioritize phone over gsm when both exist', () => {
      const sampleHit: MaksiHit = {
        id: 1028,
        name: 'Test User',
        phone: '0532111111',
        type: 2,
        sex: 'Bay',
        gsm: '0506222222',
        photo: '',
        checkListDate: '',
        checkListStatus: '',
        endDate: '',
        proximity: '0006851542',
        tc: ''
      };

      const result = mapMaksi(sampleHit);

      expect(result.phone).toBe('0532111111');
    });

    it('should use gsm when phone is empty', () => {
      const sampleHit: MaksiHit = {
        id: 1029,
        name: 'Test User 2',
        phone: '',
        type: 2,
        sex: 'Bayan',
        gsm: '0506333333',
        photo: '',
        checkListDate: '',
        checkListStatus: '',
        endDate: '',
        proximity: '0006851543',
        tc: ''
      };

      const result = mapMaksi(sampleHit);

      expect(result.phone).toBe('0506333333');
    });

    it('should handle whitespace in name and phone fields', () => {
      const sampleHit: MaksiHit = {
        id: 1030,
        name: '  Mehmet Demir  ',
        phone: '  0532444444  ',
        type: 3,
        sex: 'Bay',
        gsm: '  ',
        photo: '',
        checkListDate: '',
        checkListStatus: '',
        endDate: '',
        proximity: '0006851544',
        tc: ''
      };

      const result = mapMaksi(sampleHit);

      expect(result.fullName).toBe('Mehmet Demir');
      expect(result.phone).toBe('0532444444');
    });

    it('should handle invalid membership type', () => {
      const sampleHit: MaksiHit = {
        id: 1031,
        name: 'Test User 3',
        phone: '0532555555',
        type: NaN,
        sex: 'Bayan',
        gsm: '',
        photo: '',
        checkListDate: '',
        checkListStatus: '',
        endDate: '',
        proximity: '0006851545',
        tc: ''
      };

      const result = mapMaksi(sampleHit);

      expect(result.membershipType).toBeNull();
    });

    it('should preserve all empty string fields as null', () => {
      const sampleHit: MaksiHit = {
        id: 1032,
        name: '',
        phone: '',
        type: 0,
        sex: '',
        gsm: '',
        photo: '',
        checkListDate: '',
        checkListStatus: '',
        endDate: '',
        proximity: '0006851546',
        tc: ''
      };

      const result = mapMaksi(sampleHit);

      expect(result.fullName).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.gender).toBeNull();
      expect(result.membershipEndsAt).toBeNull();
      expect(result.lastCheckAt).toBeNull();
      expect(result.lastCheckStatus).toBeNull();
      expect(result.tcMasked).toBeNull();
      expect(result.photoFile).toBeNull();
      expect(result.rfid).toBe('0006851546'); // RFID should always be preserved
    });

    it('should handle realistic member data with Turkish characters', () => {
      const sampleHit: MaksiHit = {
        id: 1033,
        name: 'Özge Çelik',
        phone: '0532666666',
        type: 1,
        sex: 'Bayan',
        gsm: '0506777777',
        photo: 'ozge_celik.jpg',
        checkListDate: '2024-01-15 09:30',
        checkListStatus: 'in',
        endDate: '2024-12-31',
        proximity: '0006851547',
        tc: '9876543****'
      };

      const result = mapMaksi(sampleHit);

      expect(result.fullName).toBe('Özge Çelik');
      expect(result.gender).toBe('Bayan');
      expect(result.lastCheckStatus).toBe('in');
      expect(result.membershipEndsAt).toBe('2024-12-31');
    });
  });
});