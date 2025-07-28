package protocol

func S2MInitAssets(programUrl string, programHash []byte, imageUrls []string, imageHashes [][]byte) []byte {
	packet := NewPacket()
	packet.U8(0)
	packet.String(programUrl)
	packet.Bytes(programHash)
	packet.U8(uint8(len(imageUrls)))
	for i := 0; i < len(imageUrls); i++ {
		packet.String(imageUrls[i])
		packet.Bytes(imageHashes[i])
	}

	return packet.ToBuffer()
}