import { Tag, TAG_End } from './Tag';
import type { IDataInput, IDataOutput } from '@mcpe/util';

export class EndTag extends Tag {
  constructor() {
    super('');
  }

  load(dis: IDataInput): void {
    // TAG_End 无 payload
  }

  write(dos: IDataOutput): void {
    // TAG_End 无 payload
  }

  getId(): number {
    return TAG_End;
  }

  toString(): string {
    return 'END';
  }

  copy(): Tag {
    return new EndTag();
  }

  override equals(rhs: Tag): boolean {
    return super.equals(rhs);
  }
}
