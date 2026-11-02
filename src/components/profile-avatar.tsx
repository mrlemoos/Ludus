import { avatarColour } from '../../shared/avatar-colour';
import type { ReactElement, Ref } from 'react';
import { useMemo } from 'react';

interface ProfileAvatarProps {
  username: string;
  ref?: Ref<HTMLSpanElement>;
}

export function ProfileAvatar({ username, ref }: ProfileAvatarProps): ReactElement {
  const colour = avatarColour(username);
  const style = useMemo(
    () => ({ backgroundColor: colour.background, color: colour.foreground }),
    [colour.background, colour.foreground],
  );
  return (
    <span aria-hidden="true" className="profile-avatar" ref={ref} style={style}>
      {username.slice(0, 1).toUpperCase()}
    </span>
  );
}
