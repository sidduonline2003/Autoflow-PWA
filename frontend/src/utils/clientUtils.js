export const getClientDisplayName = (client) => {
  if (!client) {
    return 'Unknown';
  }

  return (
    client.name ??
    client.profile?.name ??
    client.displayName ??
    client.profile?.displayName ??
    client.companyName ??
    client.profile?.companyName ??
    'Unknown'
  );
};

export const normalizeClientRecord = (client) => {
  if (!client) {
    return client;
  }

  const normalizedName = getClientDisplayName(client);
  const profileSource = client.profile ?? {};

  return {
    ...client,
    name: client.name ?? normalizedName,
    displayName: client.displayName ?? normalizedName,
    email: client.email ?? profileSource.email ?? null,
    phone: client.phone ?? profileSource.phone ?? null,
    profile: {
      ...profileSource,
      name: profileSource.name ?? normalizedName,
      displayName: profileSource.displayName ?? normalizedName,
      email: profileSource.email ?? client.email ?? null,
      phone: profileSource.phone ?? client.phone ?? null,
      address: profileSource.address ?? client.address ?? null,
      businessType: profileSource.businessType ?? client.businessType ?? null,
    },
  };
};

export const findClientNameById = (clients, clientId) => {
  if (!Array.isArray(clients) || !clientId) {
    return 'Unknown';
  }

  const match = clients.find((client) => client.id === clientId);
  return getClientDisplayName(match);
};
