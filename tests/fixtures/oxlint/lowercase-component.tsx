interface ShareProfileProps {
  username: string;
}

export function shareProfile({ username }: ShareProfileProps) {
  return <p>{username}</p>;
}
