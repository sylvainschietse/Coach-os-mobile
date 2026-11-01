import { describe, expect, it } from 'vitest';

import { idYoutube, miniatureYoutube } from '@/domain/video';

describe('vidéos YouTube', () => {
  it('reconnaît les formats de lien courants', () => {
    expect(idYoutube('https://www.youtube.com/watch?v=54BRit2Vz4g')).toBe('54BRit2Vz4g');
    expect(idYoutube('https://youtube.com/watch?pp=0gcJCdgAo7VqN5tD&v=Ws6HyaJsE94')).toBe('Ws6HyaJsE94');
    expect(idYoutube('https://www.youtube.com/shorts/-nagKj2mOYs')).toBe('-nagKj2mOYs');
    expect(idYoutube('https://m.youtube.com/shorts/qSSUCgkISDc?google_abuse=x')).toBe('qSSUCgkISDc');
    expect(idYoutube('https://youtu.be/QQEW__B5y9I?t=3')).toBe('QQEW__B5y9I');
    expect(idYoutube('https://www.youtube.com/embed/7C8-zj3nRro')).toBe('7C8-zj3nRro');
  });
  it('ignore ce qui n’est pas une vidéo YouTube', () => {
    expect(idYoutube(undefined)).toBeUndefined();
    expect(idYoutube('https://vimeo.com/123456789')).toBeUndefined();
    expect(idYoutube('https://www.youtube.com/watch?v=court')).toBeUndefined();
    expect(idYoutube('https://www.youtube.com/@chaine')).toBeUndefined();
  });
  it('donne la miniature 16:9', () => {
    expect(miniatureYoutube('https://www.youtube.com/watch?v=54BRit2Vz4g')).toBe('https://i.ytimg.com/vi/54BRit2Vz4g/mqdefault.jpg');
    expect(miniatureYoutube('https://example.com/video.mp4')).toBeUndefined();
  });
});
